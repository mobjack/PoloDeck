import type { DeviceSummary } from "./deviceCapabilities";

export const DISPLAY_PROTOCOL_VERSION = 1;

type ClockState = {
  remainingMs: number;
  running: boolean;
  lastStartedAt: Date | null;
};

export type DisplayGameState = {
  id: string;
  status: string;
  homeTeamName: string;
  awayTeamName: string;
  currentPeriod: number;
  totalPeriods: number;
  breakPhase: string;
  score: { homeScore: number; awayScore: number } | null;
  gameClock: ClockState | null;
  shotClock: ClockState | null;
  events: Array<{ id: string; eventType: string; createdAt: Date }>;
};

function effectiveRemainingMs(clock: ClockState | null, nowMs: number): number {
  if (!clock) return 0;
  if (!clock.running || !clock.lastStartedAt) return Math.max(0, clock.remainingMs);
  return Math.max(0, clock.remainingMs - (nowMs - clock.lastStartedAt.getTime()));
}

export function buildDisplaySyncResponse(input: {
  device: DeviceSummary;
  game: DisplayGameState | null;
  nowMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const latestHorn = input.game?.events.find((event) => event.eventType === "HORN_TRIGGERED");

  return {
    protocolVersion: DISPLAY_PROTOCOL_VERSION,
    serverTimeMs: nowMs,
    pollAfterMs: input.device.type === "UNASSIGNED" ? 2000 : 500,
    device: {
      clientId: input.device.clientId,
      name: input.device.name,
      role: input.device.type,
      gameId: input.device.gameId,
    },
    state: input.game
      ? {
          gameId: input.game.id,
          status: input.game.status,
          homeTeamName: input.game.homeTeamName,
          awayTeamName: input.game.awayTeamName,
          homeScore: input.game.score?.homeScore ?? 0,
          awayScore: input.game.score?.awayScore ?? 0,
          currentPeriod: input.game.currentPeriod,
          totalPeriods: input.game.totalPeriods,
          breakPhase: input.game.breakPhase,
          gameClock: {
            remainingMs: effectiveRemainingMs(input.game.gameClock, nowMs),
            running: input.game.gameClock?.running ?? false,
          },
          shotClock: {
            remainingMs: effectiveRemainingMs(input.game.shotClock, nowMs),
            running: input.game.shotClock?.running ?? false,
          },
          horn: latestHorn
            ? {
                eventId: latestHorn.id,
                triggeredAtMs: latestHorn.createdAt.getTime(),
              }
            : null,
        }
      : null,
  };
}
