const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.AUTH_PORT || 8787);
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "auth-db.json");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], sessions: [] }, null, 2), "utf8");
  }
}

function readDb() {
  ensureDb();
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return { users: [], sessions: [] };
  }
}

function writeDb(db) {
  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

function now() {
  return Date.now();
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
    out[k] = decodeURIComponent(v);
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
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
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
  db.sessions = db.sessions.filter(s => s.expiresAt > now());
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
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
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
  const db = readDb();
  db.sessions = db.sessions.filter(s => s.expiresAt > now());

  if (pathname === "/api/auth/health" && req.method === "GET") {
    return sendJson(res, 200, { ok: true }, origin);
  }

  if (pathname === "/api/auth/me" && req.method === "GET") {
    const user = getSessionUser(req, db);
    writeDb(db);
    return sendJson(res, 200, { authenticated: !!user, user: user ? publicUser(user) : null }, origin);
  }

  if (pathname === "/api/auth/register" && req.method === "POST") {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const name = String(body.name || "").trim();
    if (!email || !email.includes("@")) return sendJson(res, 400, { error: "Некорректный email" }, origin);
    if (password.length < 6) return sendJson(res, 400, { error: "Пароль минимум 6 символов" }, origin);
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
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const user = db.users.find(u => u.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return sendJson(res, 401, { error: "Неверный email или пароль" }, origin);
    }
    const session = createSession(db, user.id);
    writeDb(db);
    setSessionCookie(res, session.token);
    return sendJson(res, 200, { user: publicUser(user) }, origin);
  }

  if (pathname === "/api/auth/logout" && req.method === "POST") {
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
    sendJson(res, 500, { error: "Server error" }, isAllowedOrigin(req.headers.origin) ? req.headers.origin : "");
  });
});

server.listen(PORT, () => {
  ensureDb();
  console.log(`Auth server listening on http://localhost:${PORT}`);
});

