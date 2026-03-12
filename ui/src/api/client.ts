const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

async function request<T>(
  path: string,
  options: RequestInit & { method?: string; body?: unknown } = {}
): Promise<T> {
  const { method = "GET", body, ...rest } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    method,
    headers: {
      "Content-Type": "application/json",
      ...rest.headers,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  gameDays: {
    list: () => request<import("../types/gameDay").GameDay[]>("/game-days"),
    get: (id: string) =>
      request<import("../types/gameDay").GameDay>(`/game-days/${id}`),
    create: (body: import("../types/gameDay").CreateGameDayInput) =>
      request<{ id: string }>("/game-days", { method: "POST", body }),
    update: (
      id: string,
      body: import("../types/gameDay").UpdateGameDayInput
    ) =>
      request<import("../types/gameDay").GameDay>(`/game-days/${id}`, {
        method: "PATCH",
        body,
      }),
  },
  games: {
    create: (body: import("../types/gameDay").CreateGameInput) =>
      request<unknown>("/games", { method: "POST", body }),
    update: (
      id: string,
      body: import("../types/gameDay").UpdateGameInput
    ) =>
      request<unknown>(`/games/${id}`, { method: "PATCH", body }),
  },
};
