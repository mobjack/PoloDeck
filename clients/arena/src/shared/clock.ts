/** Match server/src/lib/clock.ts getEffectiveRemainingMs for smooth display. */
export interface ClockLike {
  durationMs: number;
  remainingMs: number;
  running: boolean;
  lastStartedAt?: string | null;
}

export function getEffectiveRemainingMs(state: ClockLike, now: number = Date.now()): number {
  if (!state.running || state.lastStartedAt == null) {
    return Math.max(0, state.remainingMs);
  }
  const started = new Date(state.lastStartedAt).getTime();
  const elapsed = now - started;
  const remaining = state.remainingMs - elapsed;
  return Math.max(0, remaining);
}

export function formatMmSs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
