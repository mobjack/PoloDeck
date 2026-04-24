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
