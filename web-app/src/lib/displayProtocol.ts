export type DisplayProtocolClock = {
  remainingMs: number;
  running: boolean;
};

export type DisplaySyncResponse = {
  protocolVersion: number;
  serverTimeMs: number;
  pollAfterMs: number;
  device: {
    clientId: string;
    name: string | null;
    role: "UNASSIGNED" | "SCOREBOARD" | "SHOT_CLOCK" | "TIMER";
    gameId: string | null;
  };
  state: null | {
    gameId: string;
    status: string;
    homeTeamName: string;
    awayTeamName: string;
    homeScore: number;
    awayScore: number;
    currentPeriod: number;
    totalPeriods: number;
    breakPhase: string;
    gameClock: DisplayProtocolClock;
    shotClock: DisplayProtocolClock;
    horn: null | { eventId: string; triggeredAtMs: number };
  };
};

export type SimulatedDisplayFrame = {
  role: DisplaySyncResponse["device"]["role"];
  gameId: string | null;
  gameRemainingMs: number;
  shotRemainingMs: number;
  gameRunning: boolean;
  shotRunning: boolean;
  period: number;
};

function interpolate(clock: DisplayProtocolClock | undefined, elapsedMs: number): number {
  if (!clock) return 0;
  if (!clock.running) return Math.max(0, clock.remainingMs);
  return Math.max(0, clock.remainingMs - Math.max(0, elapsedMs));
}

export function displayFrameAt(
  response: DisplaySyncResponse,
  receivedAtMs: number,
  nowMs: number,
  snapshotAgeMs = 0
): SimulatedDisplayFrame {
  const elapsedMs = nowMs - receivedAtMs + Math.max(0, snapshotAgeMs);
  return {
    role: response.device.role,
    gameId: response.device.gameId,
    gameRemainingMs: interpolate(response.state?.gameClock, elapsedMs),
    shotRemainingMs: interpolate(response.state?.shotClock, elapsedMs),
    gameRunning: response.state?.gameClock.running ?? false,
    shotRunning: response.state?.shotClock.running ?? false,
    period: response.state?.currentPeriod ?? 1,
  };
}

export function isNewHornEvent(
  previousEventId: string | null | undefined,
  nextEventId: string | null
): boolean {
  return previousEventId !== undefined && nextEventId !== null && nextEventId !== previousEventId;
}

export function crossedClockZero(
  previousRemainingMs: number | null,
  nextRemainingMs: number,
  running: boolean
): boolean {
  return previousRemainingMs !== null && previousRemainingMs > 0 && nextRemainingMs === 0 && running;
}
