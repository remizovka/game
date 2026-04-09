import { mountAuthBadge } from "./auth-badge";

type MeResponse = {
  authenticated: boolean;
  user: null | {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
    authProviders: string[];
  };
};

const API_BASE = (window as unknown as { AUTH_API_BASE?: string }).AUTH_API_BASE || "http://localhost:8787";
mountAuthBadge();

const authCard = document.querySelector("#authCard") as HTMLElement;
const profileCard = document.querySelector("#profileCard") as HTMLElement;
const authMsg = document.querySelector("#authMsg") as HTMLElement;
const loginForm = document.querySelector("#loginForm") as HTMLFormElement;
const registerForm = document.querySelector("#registerForm") as HTMLFormElement;
const googleBtn = document.querySelector("#googleBtn") as HTMLButtonElement;
const logoutBtn = document.querySelector("#logoutBtn") as HTMLButtonElement;
const tabs = Array.from(document.querySelectorAll(".tab")) as HTMLButtonElement[];

function setMessage(text: string, isError = false) {
  authMsg.textContent = text;
  authMsg.classList.toggle("error", isError);
}

async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function switchTab(name: "login" | "register") {
  tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.tab === name));
  loginForm.classList.toggle("active", name === "login");
  registerForm.classList.toggle("active", name === "register");
  setMessage("");
}

function renderProfile(me: MeResponse) {
  const user = me.user;
  if (!me.authenticated || !user) {
    authCard.classList.remove("hidden");
    profileCard.classList.add("hidden");
    return;
  }

  authCard.classList.add("hidden");
  profileCard.classList.remove("hidden");

  (document.querySelector("#profileName") as HTMLElement).textContent = user.name || "Игрок";
  (document.querySelector("#profileEmail") as HTMLElement).textContent = user.email;
  // Пока stats на клиент не отдаем отдельно; placeholders.
  (document.querySelector("#belkaGames") as HTMLElement).textContent = "0";
  (document.querySelector("#belkaWins") as HTMLElement).textContent = "0";
  (document.querySelector("#muGames") as HTMLElement).textContent = "0";
  (document.querySelector("#muWins") as HTMLElement).textContent = "0";
}

async function refreshMe() {
  try {
    const me = (await api("/api/auth/me")) as MeResponse;
    renderProfile(me);
  } catch (err) {
    setMessage(err instanceof Error ? err.message : String(err), true);
  }
}

tabs.forEach(tab => {
  tab.addEventListener("click", () => switchTab((tab.dataset.tab || "login") as "login" | "register"));
});

loginForm.addEventListener("submit", async e => {
  e.preventDefault();
  const fd = new FormData(loginForm);
  try {
    setMessage("Входим...");
    await api("/api/auth/login", "POST", {
      email: fd.get("email"),
      password: fd.get("password"),
    });
    setMessage("");
    await refreshMe();
  } catch (err) {
    setMessage(err instanceof Error ? err.message : String(err), true);
  }
});

registerForm.addEventListener("submit", async e => {
  e.preventDefault();
  const fd = new FormData(registerForm);
  try {
    setMessage("Создаем аккаунт...");
    await api("/api/auth/register", "POST", {
      name: fd.get("name"),
      email: fd.get("email"),
      password: fd.get("password"),
    });
    setMessage("");
    await refreshMe();
  } catch (err) {
    setMessage(err instanceof Error ? err.message : String(err), true);
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", "POST");
    authCard.classList.remove("hidden");
    profileCard.classList.add("hidden");
    switchTab("login");
  } catch (err) {
    setMessage(err instanceof Error ? err.message : String(err), true);
  }
});

googleBtn.addEventListener("click", async () => {
  try {
    const cfg = await api("/api/auth/google/config");
    setMessage(cfg.enabled ? "Google OAuth готов к подключению" : "Google OAuth еще не настроен");
  } catch (err) {
    setMessage(err instanceof Error ? err.message : String(err), true);
  }
});

switchTab("login");
refreshMe();
