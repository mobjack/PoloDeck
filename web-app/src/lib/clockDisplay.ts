import type { GameAggregate } from "../api/client";

export type BreakPhase = "NONE" | "QUARTER_BREAK" | "HALFTIME";

export function isGameFinal(
  aggregate: Pick<GameAggregate, "status">
): boolean {
  return aggregate.status === "FINAL";
}

/** Short phase label: Final, Q1–Q4, OT, or HT during halftime. */
export function getGamePhaseLabel(
  aggregate: Pick<GameAggregate, "status" | "currentPeriod" | "breakPhase">
): string {
  if (isGameFinal(aggregate)) return "Final";
  if (aggregate.breakPhase === "HALFTIME") return "HT";
  if (aggregate.currentPeriod >= 5) return "OT";
  return `Q${aggregate.currentPeriod}`;
}

/** Timer / kiosk subtitle: "Final" or "Period 2 of 4". */
export function getGamePeriodSubtitle(
  aggregate: Pick<GameAggregate, "status" | "currentPeriod" | "totalPeriods">
): string {
  if (isGameFinal(aggregate)) return "Final";
  return `Period ${aggregate.currentPeriod} of ${aggregate.totalPeriods}`;
}

/** Game sheet scoreboard footer, e.g. "Period: Final" or "Period: Q3 · HT". */
export function formatGamePeriodFooter(
  aggregate: Pick<GameAggregate, "status" | "currentPeriod" | "breakPhase">
): string {
  if (isGameFinal(aggregate)) return "Period: Final";
  if (aggregate.breakPhase === "HALFTIME") {
    return `Period: Q${aggregate.currentPeriod} · HT`;
  }
  return `Period: ${getGamePhaseLabel(aggregate)}`;
}

export function isOnBreak(
  aggregate: Pick<GameAggregate, "breakPhase">
): boolean {
  return aggregate.breakPhase != null && aggregate.breakPhase !== "NONE";
}

/** Quarter ended (eq) but break countdown not started yet (sb / Timer). */
export function isBreakPending(
  aggregate: Pick<GameAggregate, "breakPhase" | "breakAfterPeriod">
): boolean {
  return (
    !isOnBreak(aggregate) &&
    aggregate.breakAfterPeriod != null &&
    aggregate.breakAfterPeriod >= 1
  );
}

function labelForEndedPeriod(
  afterPeriod: number,
  halftimeDurationMs?: number
): string {
  if (afterPeriod === 2 && (halftimeDurationMs ?? 0) > 0) return "Halftime";
  if (afterPeriod >= 1) return `End Q${afterPeriod}`;
  return "Break";
}

/** Label for pending break (before sb). */
export function getPendingBreakLabel(
  aggregate: Pick<
    GameAggregate,
    "breakPhase" | "breakAfterPeriod" | "halftimeDurationMs"
  >
): string | null {
  if (!isBreakPending(aggregate)) return null;
  return labelForEndedPeriod(
    aggregate.breakAfterPeriod!,
    aggregate.halftimeDurationMs
  );
}

/** Button text: "Start Halftime", "Start End Q1", etc. */
export function getStartBreakButtonLabel(
  aggregate: Pick<
    GameAggregate,
    "breakPhase" | "breakAfterPeriod" | "halftimeDurationMs"
  >
): string | null {
  const pending = getPendingBreakLabel(aggregate);
  if (!pending) return null;
  return `Start ${pending}`;
}

/** @deprecated Use isOnBreak + getBreakDisplayLabel */
export function isHalftimeActive(
  aggregate: Pick<
    GameAggregate,
    "status" | "currentPeriod" | "halftimeDurationMs" | "gameClock" | "breakPhase"
  >
): boolean {
  if (aggregate.breakPhase === "HALFTIME") return true;
  if (aggregate.status === "FINAL") return false;
  if (aggregate.currentPeriod !== 3) return false;
  const halftimeMs = aggregate.halftimeDurationMs ?? 5 * 60 * 1000;
  const clockDur = aggregate.gameClock?.durationMs;
  return clockDur != null && Math.abs(clockDur - halftimeMs) < 500;
}

/** Human label: "End Q1", "Halftime", "End Q3", etc. */
export function getBreakDisplayLabel(
  aggregate: Pick<
    GameAggregate,
    "breakPhase" | "breakAfterPeriod" | "halftimeDurationMs"
  >
): string | null {
  if (!isOnBreak(aggregate)) return null;
  if (aggregate.breakPhase === "HALFTIME") return "Halftime";
  const after = aggregate.breakAfterPeriod;
  if (after != null && after >= 1) return `End Q${after}`;
  return null;
}

/** Shot clock display during break — always 00. */
export function formatShotClockDuringBreak(): string {
  return "0";
}

/** Remaining break time from game clock (authoritative during breaks). */
export function getBreakRemainingMs(
  aggregate: Pick<GameAggregate, "breakPhase" | "gameClock">,
  now: number = Date.now()
): number {
  if (!isOnBreak(aggregate) || !aggregate.gameClock) return 0;
  return getEffectiveRemainingMs(aggregate.gameClock, now);
}

/** Remaining time from server snapshot + running state (mirrors server/src/lib/clock). */
export function getEffectiveRemainingMs(
  state: {
    remainingMs: number;
    running: boolean;
    lastStartedAt?: string | null;
  },
  now: number = Date.now()
): number {
  if (!state.running || !state.lastStartedAt) {
    return Math.max(0, state.remainingMs);
  }
  const started = new Date(state.lastStartedAt).getTime();
  if (Number.isNaN(started)) {
    return Math.max(0, state.remainingMs);
  }
  const elapsed = now - started;
  return Math.max(0, state.remainingMs - elapsed);
}

/** Game clock: m:ss while ≥1:00, else one decimal of seconds (tenths). */
export function formatGameTimeDisplay(ms: number): string {
  const totalSec = Math.max(0, ms) / 1000;
  if (totalSec >= 60) {
    const m = Math.floor(totalSec / 60);
    const s = Math.floor(totalSec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  return totalSec.toFixed(1);
}

/** Shot clock: whole seconds (m:ss or seconds). */
export function formatShotClockDisplay(ms: number): string {
  const totalSec = Math.max(0, ms) / 1000;
  if (totalSec >= 60) {
    const m = Math.floor(totalSec / 60);
    const s = Math.floor(totalSec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  return String(Math.max(0, Math.ceil(totalSec - 1e-9)));
}

/** Break countdown on scoreboard/kiosk: m:ss for breaks (usually ≥ 1 min). */
export function formatBreakCountdownDisplay(ms: number): string {
  return formatGameTimeDisplay(ms);
}
