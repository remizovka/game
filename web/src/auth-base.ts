const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", ""]);

/**
 * Возвращает адрес auth API или null, когда авторизация недоступна
 * (например, на GitHub Pages, где локальный сервер не запущен).
 * Переопределяется через window.AUTH_API_BASE.
 */
export function resolveAuthApiBase(): string | null {
  const override = (window as unknown as { AUTH_API_BASE?: string }).AUTH_API_BASE;
  if (typeof override === "string" && override.trim()) {
    return override.trim().replace(/\/+$/, "");
  }
  if (LOCAL_HOSTS.has(window.location.hostname)) {
    return "http://localhost:8787";
  }
  return null;
}

export function authFetchErrorMessage(err: unknown): string {
  if (err instanceof TypeError) {
    return "Сервер авторизации недоступен. Запустите его локально: npm run auth:dev";
  }
  return err instanceof Error ? err.message : String(err);
}
