const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

async function request<T>(
  path: string,
  options: (Omit<RequestInit, "body"> & { method?: string; json?: unknown }) = {}
): Promise<T> {
  const { method = "GET", json, ...rest } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    method,
    headers: {
      "Content-Type": "application/json",
      ...rest.headers,
    },
    body: json != null ? JSON.stringify(json) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface DeviceCapabilities {
  hasScoreboard: boolean;
  hasTimer: boolean;
  hasShotClock: boolean;
  shotClockCount: number;
  mode: string;
}

export interface GameAggregate {
  id: string;
  gameDayId: string | null;
  scheduledAt: string | null;
  homeTeamName: string;
  awayTeamName: string;
  level: string | null;
  gender: string | null;
  gameType: string | null;
  currentPeriod: number;
  totalPeriods: number;
  score: {
    homeScore: number;
    awayScore: number;
  } | null;
  gameClock: {
    durationMs: number;
    remainingMs: number;
    running: boolean;
  } | null;
  shotClock: {
    durationMs: number;
    remainingMs: number;
    running: boolean;
  } | null;
  timeoutStates: {
    teamSide: "HOME" | "AWAY";
    fullTimeoutsRemaining: number;
    shortTimeoutsRemaining: number;
  }[];
  players: {
    id: string;
    gameId: string;
    teamSide: "HOME" | "AWAY";
    capNumber: string;
    playerName: string;
  }[];
  events: {
    id: string;
    gameId: string;
    eventType: string;
    payload: any;
    createdAt: string;
  }[];
}

export const api = {
  capabilities: () =>
    request<DeviceCapabilities>("/capabilities"),
  gameDays: {
    list: () => request<import("../types/gameDay").GameDay[]>("/game-days"),
    get: (id: string) =>
      request<import("../types/gameDay").GameDay>(`/game-days/${id}`),
    create: (body: import("../types/gameDay").CreateGameDayInput) =>
      request<{ id: string }>("/game-days", { method: "POST", json: body }),
    update: (
      id: string,
      body: import("../types/gameDay").UpdateGameDayInput
    ) =>
      request<import("../types/gameDay").GameDay>(`/game-days/${id}`, {
        method: "PATCH",
        json: body,
      }),
  },
  games: {
    list: () =>
      request<any[]>("/games"),
    create: (body: import("../types/gameDay").CreateGameInput) =>
      request<unknown>("/games", { method: "POST", json: body }),
    update: (
      id: string,
      body: import("../types/gameDay").UpdateGameInput
    ) =>
      request<unknown>(`/games/${id}`, { method: "PATCH", json: body }),
    getAggregate: (id: string) =>
      request<GameAggregate>(`/games/${id}`),
    getRoster: (
      id: string
    ) =>
      request<
        {
          id: string;
          gameId: string;
          teamSide: "HOME" | "AWAY";
          capNumber: string;
          playerName: string;
        }[]
      >(`/games/${id}/roster`),
    replaceRoster: (
      id: string,
      body: {
        home?: { capNumber: string; playerName: string }[];
        away?: { capNumber: string; playerName: string }[];
      }
    ) =>
      request<unknown>(`/games/${id}/roster/replace`, {
        method: "POST",
        json: body,
      }),
    applyScoreCommand: (
      id: string,
      body: {
        type: "START_QUARTER" | "END_QUARTER" | "GOAL" | "EXCLUSION" | "PENALTY" | "TIMEOUT" | "TIMEOUT_30";
        timeSeconds?: number;
        side?: "HOME" | "AWAY";
        capNumber?: string;
      }
    ) =>
      request<GameAggregate>(`/games/${id}/score-command`, {
        method: "POST",
        json: body,
      }),
  },
};
