import type { DeviceCapabilities, DeviceRole, GameAggregate, GameListItem } from "./types";

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(text || `HTTP ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

export async function fetchGameAggregate(apiBase: string, gameId: string): Promise<GameAggregate> {
  const res = await fetch(`${apiBase}/games/${encodeURIComponent(gameId)}`);
  return parseJsonOrThrow<GameAggregate>(res);
}

export async function listGames(apiBase: string): Promise<GameListItem[]> {
  const res = await fetch(`${apiBase}/games`);
  return parseJsonOrThrow<GameListItem[]>(res);
}

export async function fetchCapabilities(apiBase: string): Promise<DeviceCapabilities> {
  const res = await fetch(`${apiBase}/capabilities`);
  return parseJsonOrThrow<DeviceCapabilities>(res);
}

export async function checkInDevice(
  apiBase: string,
  body: { clientId: string; type: DeviceRole; name?: string }
): Promise<{ device: { id: string; clientId: string; type: DeviceRole; name?: string | null } }> {
  const res = await fetch(`${apiBase}/devices/check-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJsonOrThrow<{ device: { id: string; clientId: string; type: DeviceRole; name?: string | null } }>(res);
}
