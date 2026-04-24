const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

/** Thrown for failed API responses; includes optional machine-readable `code`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function isDatabaseUnavailableError(err: unknown): boolean {
  return err instanceof ApiError && err.code === "DATABASE_UNAVAILABLE";
}

async function request<T>(
  path: string,
  options: (Omit<RequestInit, "body"> & { method?: string; json?: unknown }) = {}
): Promise<T> {
  const { method = "GET", json, ...rest } = options;
  const hasJsonBody = json !== undefined;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    method,
    headers: {
      ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
      ...rest.headers,
    },
    body: hasJsonBody ? JSON.stringify(json) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `HTTP ${res.status}`;
    let code: string | undefined;
    try {
      const body = JSON.parse(text) as { message?: string; code?: string };
      if (typeof body?.message === "string") {
        message = body.message;
      }
      if (typeof body?.code === "string") {
        code = body.code;
      }
    } catch {
      /* leave message as text */
    }
    throw new ApiError(message, res.status, code);
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
  status: "PENDING" | "IN_PROGRESS" | "FINAL";
  /** Per-period length; mirrors game clock duration. */
  quarterDurationMs?: number;
  breakBetweenQuartersDurationMs?: number;
  halftimeDurationMs?: number;
  score: {
    homeScore: number;
    awayScore: number;
  } | null;
  gameClock: {
    durationMs: number;
    remainingMs: number;
    running: boolean;
    lastStartedAt?: string | null;
  } | null;
  shotClock: {
    durationMs: number;
    remainingMs: number;
    running: boolean;
    lastStartedAt?: string | null;
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
    source?: string;
  }[];
}

/**
 * Older servers may not expose POST /games/:id/period/set. Uses clock stops + repeated
 * period/advance (and optional status FINAL) to approximate setGamePeriod for forward moves only.
 */
async function setPeriodFallback(id: string, targetPeriod: number): Promise<GameAggregate> {
  let agg = await request<GameAggregate>(`/games/${id}`);
  const tp = agg.totalPeriods;
  if (targetPeriod < 1 || targetPeriod > tp) {
    throw new ApiError("Invalid period for this game", 400);
  }

  await request(`/games/${id}/game-clock/stop`, { method: "POST" }).catch(() => undefined);
  await request(`/games/${id}/shot-clock/stop`, { method: "POST" }).catch(() => undefined);

  agg = await request<GameAggregate>(`/games/${id}`);
  let cp = agg.currentPeriod;

  if (cp > targetPeriod) {
    throw new ApiError(
      "Moving to an earlier period requires a newer API (POST /api/games/:id/period/set). Redeploy or restart the server, or use the game sheet.",
      400
    );
  }

  let guard = 0;
  while (cp < targetPeriod && guard < 16) {
    guard += 1;
    agg = await request<GameAggregate>(`/games/${id}/period/advance`, { method: "POST" });
    cp = agg.currentPeriod;
  }

  if (cp < targetPeriod) {
    throw new ApiError("Could not reach the selected period. Try again or update the server.", 500);
  }

  return agg;
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
      request<GameAggregate>(`/games/${id}`, { method: "PATCH", json: body }),
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
        overtime?: boolean;
      }
    ) =>
      request<GameAggregate>(`/games/${id}/score-command`, {
        method: "POST",
        json: body,
      }),
    setPeriod: async (id: string, period: number) => {
      try {
        return await request<GameAggregate>(`/games/${id}/period/set`, {
          method: "POST",
          json: { period },
        });
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          return setPeriodFallback(id, period);
        }
        throw e;
      }
    },
    scoreHomeIncrement: (id: string) =>
      request<GameAggregate>(`/games/${id}/score/home/increment`, { method: "POST" }),
    scoreHomeDecrement: (id: string) =>
      request<GameAggregate>(`/games/${id}/score/home/decrement`, { method: "POST" }),
    scoreAwayIncrement: (id: string) =>
      request<GameAggregate>(`/games/${id}/score/away/increment`, { method: "POST" }),
    scoreAwayDecrement: (id: string) =>
      request<GameAggregate>(`/games/${id}/score/away/decrement`, { method: "POST" }),
    rebuildEventLog: (
      id: string,
      body: {
        events: {
          id?: string;
          eventType: string;
          payload?: unknown;
          createdAt: string;
          source?: string;
        }[];
      }
    ) =>
      request<GameAggregate>(`/games/${id}/event-log/rebuild`, {
        method: "POST",
        json: body,
      }),
    gameClockStart: (id: string) =>
      request<GameAggregate>(`/games/${id}/game-clock/start`, { method: "POST" }),
    gameClockStop: (id: string) =>
      request<GameAggregate>(`/games/${id}/game-clock/stop`, { method: "POST" }),
    shotClockReset: (id: string) =>
      request<GameAggregate>(`/games/${id}/shot-clock/reset`, { method: "POST" }),
    shotClockUndoReset: (id: string) =>
      request<GameAggregate>(`/games/${id}/shot-clock/undo-reset`, { method: "POST" }),
    setGameClockRemaining: (id: string, remainingMs: number) =>
      request<GameAggregate>(`/games/${id}/game-clock/set`, {
        method: "POST",
        json: { remainingMs },
      }),
    setShotClockRemaining: (id: string, remainingMs: number) =>
      request<GameAggregate>(`/games/${id}/shot-clock/set`, {
        method: "POST",
        json: { remainingMs },
      }),
  },
};
