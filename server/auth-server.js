const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.AUTH_PORT || 8787);
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "auth-db.json");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const MAX_PASSWORD_LENGTH = 128;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 100;

// Разрешенные origin'ы фронтенда. Не отражаем произвольный localhost-порт:
// куки localhost общие для всех портов, и credentialed CORS на любой порт
// отдал бы сессию любому локальному приложению.
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];
const ALLOWED_ORIGINS = new Set(
  [
    ...DEFAULT_ALLOWED_ORIGINS,
    ...String(process.env.AUTH_ALLOWED_ORIGINS || "")
      .split(",")
      .map(origin => origin.trim())
      .filter(Boolean),
  ].map(origin => origin.toLowerCase())
);

// Простое ограничение частоты попыток входа/регистрации на IP.
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 20;
const rateBuckets = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(ip, { start: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  if (rateBuckets.size > 10000) rateBuckets.clear();
  return bucket.count > RATE_LIMIT_MAX_ATTEMPTS;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function normalizeDb(raw) {
  const db = raw && typeof raw === "object" ? raw : {};
  return {
    users: Array.isArray(db.users) ? db.users : [],
    sessions: Array.isArray(db.sessions) ? db.sessions : [],
  };
}

function readDb() {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    return { users: [], sessions: [] };
  }
  try {
    return normalizeDb(JSON.parse(fs.readFileSync(DB_FILE, "utf8")));
  } catch (err) {
    // Поврежденный файл откладываем в сторону, чтобы не затереть данные
    // следующей записью и дать шанс восстановить их вручную.
    const backup = `${DB_FILE}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(DB_FILE, backup);
      console.error(`auth-db.json поврежден (${err.message}); файл сохранен как ${backup}`);
    } catch (renameErr) {
      console.error(`auth-db.json поврежден и не удалось сделать резервную копию: ${renameErr.message}`);
    }
    return { users: [], sessions: [] };
  }
}

function writeDb(db) {
  ensureDataDir();
  // Атомарная запись: временный файл + rename, чтобы обрыв процесса
  // не оставил наполовину записанный JSON.
  const tmp = `${DB_FILE}.tmp-${process.pid}`;
  const payload = JSON.stringify(db, null, 2);
  fs.writeFileSync(tmp, payload, "utf8");
  // На Windows rename поверх существующего файла может дать EPERM/EBUSY,
  // пока файл держит антивирус или индексатор — пробуем несколько раз.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.renameSync(tmp, DB_FILE);
      return;
    } catch (err) {
      if (err.code !== "EPERM" && err.code !== "EACCES" && err.code !== "EBUSY") {
        try { fs.unlinkSync(tmp); } catch {}
        throw err;
      }
      const until = Date.now() + 10 * (attempt + 1);
      while (Date.now() < until) { /* короткое синхронное ожидание */ }
    }
  }
  // Rename так и не прошел — пишем напрямую, чтобы не потерять данные.
  fs.writeFileSync(DB_FILE, payload, "utf8");
  try { fs.unlinkSync(tmp); } catch {}
}

function now() {
  return Date.now();
}

function pruneSessions(db) {
  db.sessions = db.sessions.filter(s => s.expiresAt > now());
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  const out = {};
  raw.split(";").forEach(part => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      // Куки чужих localhost-приложений могут содержать сырой "%" —
      // не даем им ронять каждый запрос.
      out[k] = v;
    }
  });
  return out;
}

function sendJson(res, status, data, origin) {
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function sendNoContent(res, origin) {
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.writeHead(204);
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    req.setEncoding("utf8");
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 64 * 1024) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const digest = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, digest };
}

// Фиктивный хеш, чтобы логин с несуществующим email занимал столько же
// времени, сколько и с существующим (иначе по времени ответа можно
// перечислять зарегистрированные адреса).
const DUMMY_HASH = hashPassword("dummy-password-for-timing");

function verifyPassword(password, passwordHash) {
  if (!passwordHash || !passwordHash.salt || !passwordHash.digest) return false;
  const digest = crypto.scryptSync(password, passwordHash.salt, 64).toString("hex");
  const a = Buffer.from(digest, "hex");
  const b = Buffer.from(passwordHash.digest, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const record = {
    token,
    userId,
    createdAt: now(),
    expiresAt: now() + SESSION_TTL_MS,
  };
  db.sessions.push(record);
  return record;
}

function clearSession(res) {
  res.setHeader("Set-Cookie", "sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

function setSessionCookie(res, token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader("Set-Cookie", `sid=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name || null,
    createdAt: user.createdAt,
    authProviders: user.authProviders || ["password"],
  };
}

function getSessionUser(req, db) {
  const cookies = parseCookies(req);
  const token = cookies.sid;
  if (!token) return null;
  const session = db.sessions.find(s => s.token === token && s.expiresAt > now());
  if (!session) return null;
  const user = db.users.find(u => u.id === session.userId);
  return user || null;
}

function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(String(origin).toLowerCase());
}

async function handle(req, res) {
  const origin = isAllowedOrigin(req.headers.origin) ? req.headers.origin : "";
  if (req.method === "OPTIONS") {
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    return sendNoContent(res, origin);
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  const clientIp = req.socket.remoteAddress || "unknown";

  if (pathname === "/api/auth/health" && req.method === "GET") {
    return sendJson(res, 200, { ok: true }, origin);
  }

  if (pathname === "/api/auth/me" && req.method === "GET") {
    const db = readDb();
    pruneSessions(db);
    const user = getSessionUser(req, db);
    return sendJson(res, 200, { authenticated: !!user, user: user ? publicUser(user) : null }, origin);
  }

  if (pathname === "/api/auth/register" && req.method === "POST") {
    if (isRateLimited(clientIp)) {
      return sendJson(res, 429, { error: "Слишком много попыток, попробуйте через минуту" }, origin);
    }
    // Тело читаем до чтения базы: между readDb и writeDb не должно быть await,
    // иначе параллельный запрос перезапишет чужие изменения устаревшим снимком.
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const name = String(body.name || "").trim().slice(0, MAX_NAME_LENGTH);
    if (!email || !email.includes("@") || email.length > MAX_EMAIL_LENGTH) {
      return sendJson(res, 400, { error: "Некорректный email" }, origin);
    }
    if (password.length < 6) return sendJson(res, 400, { error: "Пароль минимум 6 символов" }, origin);
    if (password.length > MAX_PASSWORD_LENGTH) {
      return sendJson(res, 400, { error: `Пароль не длиннее ${MAX_PASSWORD_LENGTH} символов` }, origin);
    }

    const db = readDb();
    pruneSessions(db);
    if (db.users.some(u => u.email === email)) return sendJson(res, 409, { error: "Пользователь уже существует" }, origin);

    const id = crypto.randomUUID();
    const passwordHash = hashPassword(password);
    const user = {
      id,
      email,
      name: name || null,
      passwordHash,
      authProviders: ["password"],
      createdAt: new Date().toISOString(),
      stats: { belka: { games: 0, wins: 0 }, mu: { games: 0, wins: 0 } },
    };
    db.users.push(user);
    const session = createSession(db, id);
    writeDb(db);
    setSessionCookie(res, session.token);
    return sendJson(res, 201, { user: publicUser(user) }, origin);
  }

  if (pathname === "/api/auth/login" && req.method === "POST") {
    if (isRateLimited(clientIp)) {
      return sendJson(res, 429, { error: "Слишком много попыток, попробуйте через минуту" }, origin);
    }
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "").slice(0, MAX_PASSWORD_LENGTH);

    const db = readDb();
    pruneSessions(db);
    const user = db.users.find(u => u.email === email);
    const passwordOk = verifyPassword(password, user ? user.passwordHash : DUMMY_HASH) && !!user;
    if (!passwordOk) {
      return sendJson(res, 401, { error: "Неверный email или пароль" }, origin);
    }
    const session = createSession(db, user.id);
    writeDb(db);
    setSessionCookie(res, session.token);
    return sendJson(res, 200, { user: publicUser(user) }, origin);
  }

  if (pathname === "/api/auth/logout" && req.method === "POST") {
    const db = readDb();
    pruneSessions(db);
    const token = parseCookies(req).sid;
    if (token) db.sessions = db.sessions.filter(s => s.token !== token);
    writeDb(db);
    clearSession(res);
    return sendJson(res, 200, { ok: true }, origin);
  }

  if (pathname === "/api/auth/google/config" && req.method === "GET") {
    return sendJson(
      res,
      200,
      {
        enabled: false,
        message: "Google OAuth scaffold only. Add GOOGLE_CLIENT_ID/SECRET and implement callback exchange.",
      },
      origin
    );
  }

  if ((pathname === "/api/auth/google/start" || pathname === "/api/auth/google/callback") && req.method === "GET") {
    return sendJson(res, 501, { error: "Google OAuth еще не настроен" }, origin);
  }

  return sendJson(res, 404, { error: "Not found" }, origin);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(err => {
    console.error(err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: "Server error" }, isAllowedOrigin(req.headers.origin) ? req.headers.origin : "");
    } else {
      res.end();
    }
  });
});

server.listen(PORT, () => {
  ensureDataDir();
  console.log(`Auth server listening on http://localhost:${PORT}`);
});
