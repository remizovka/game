type AuthMe = {
  authenticated: boolean;
  user: null | { email: string; name: string | null };
};

const AUTH_API_BASE = "http://localhost:8787";
const BADGE_ID = "authStatusBadge";
type MountAuthBadgeOptions = {
  mode?: "floating" | "inline";
  beforeSelector?: string;
  containerSelector?: string;
};

function ensureBadgeStyles() {
  if (document.getElementById("authBadgeStyles")) return;
  const style = document.createElement("style");
  style.id = "authBadgeStyles";
  style.textContent = `
    .auth-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 12px;
      border: 1px solid var(--auth-border, rgba(214, 163, 89, 0.45));
      background: var(--auth-bg, linear-gradient(180deg, rgba(57,33,17,.94), rgba(31,18,11,.94)));
      color: var(--auth-text, #f5e7c8);
      box-shadow: 0 10px 24px var(--auth-shadow, rgba(0,0,0,.28));
      font: 600 12px/1.2 "Plus Jakarta Sans", system-ui, sans-serif;
      backdrop-filter: blur(4px);
    }
    .auth-badge.floating {
      position: fixed;
      left: 14px;
      bottom: 14px;
      z-index: 9999;
      max-width: min(92vw, 420px);
    }
    .auth-badge.inline {
      position: static;
      max-width: min(46vw, 380px);
      padding: 6px 8px;
      border-radius: 10px;
      font-size: 11px;
      box-shadow: none;
    }
    .auth-badge[data-state="error"] { border-color: rgba(217, 102, 83, 0.45); color: #f5c6bc; }
    .auth-badge .auth-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      flex: 0 0 auto;
      background: #7b8a97;
      box-shadow: 0 0 0 3px rgba(255,255,255,.05);
    }
    .auth-badge[data-state="user"] .auth-dot { background: #48cf7f; }
    .auth-badge[data-state="guest"] .auth-dot { background: #c29a59; }
    .auth-badge[data-state="error"] .auth-dot { background: #e06f5a; }
    .auth-badge .auth-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
      flex: 1 1 auto;
    }
    .auth-badge .auth-link {
      color: var(--auth-link-text, #ffe1a6);
      text-decoration: none;
      border: 1px solid var(--auth-link-border, rgba(214, 163, 89, 0.35));
      border-radius: 8px;
      padding: 5px 8px;
      flex: 0 0 auto;
      background: var(--auth-link-bg, rgba(255,255,255,.02));
    }
    .auth-badge.inline .auth-link {
      padding: 4px 7px;
      border-radius: 7px;
    }
    .auth-badge .auth-link:hover { filter: brightness(1.08); }
  `;
  document.head.append(style);
}

function ensureBadge(options: MountAuthBadgeOptions = {}) {
  let badge = document.getElementById(BADGE_ID) as HTMLElement | null;
  if (badge) return badge;
  badge = document.createElement("div");
  badge.id = BADGE_ID;
  const mode = options.mode || "floating";
  badge.className = `auth-badge ${mode}`;
  badge.innerHTML = `
    <span class="auth-dot"></span>
    <span class="auth-text">Проверяем вход...</span>
    <a class="auth-link" href="/account.html">Кабинет</a>
  `;
  if (mode === "inline") {
    const beforeEl = options.beforeSelector ? document.querySelector(options.beforeSelector) : null;
    const container = (options.containerSelector ? document.querySelector(options.containerSelector) : null)
      || beforeEl?.parentElement
      || document.body;
    if (beforeEl && beforeEl.parentElement) {
      beforeEl.parentElement.insertBefore(badge, beforeEl);
    } else {
      container.append(badge);
    }
  } else {
    document.body.append(badge);
  }
  return badge;
}

function setBadge(state: "user" | "guest" | "error", text: string) {
  const badge = ensureBadge();
  badge.dataset.state = state;
  const textEl = badge.querySelector(".auth-text") as HTMLElement;
  textEl.textContent = text;
}

export async function mountAuthBadge(options: MountAuthBadgeOptions = {}) {
  ensureBadgeStyles();
  ensureBadge(options);
  try {
    const res = await fetch(`${AUTH_API_BASE}/api/auth/me`, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const me = (await res.json()) as AuthMe;
    if (me.authenticated && me.user) {
      const label = me.user.name?.trim() || me.user.email;
      setBadge("user", `Вы вошли: ${label}`);
    } else {
      setBadge("guest", "Вы не вошли");
    }
  } catch {
    setBadge("error", "Авторизация недоступна");
  }
}
