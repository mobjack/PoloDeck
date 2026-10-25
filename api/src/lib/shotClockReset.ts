/** Shortened possession reset used when the offense keeps the ball after a shot. */
export const TWENTY_SECOND_RESET_MS = 20_000;

export function resolveShotClockResetMs(input: {
  requestedMs?: number;
  /** Length currently stored on the shot-clock row. A full reset uses this. */
  clockDurationMs: number;
  /** Regulation possession length on the game. */
  regulationMs: number;
  twentyResetEnabled: boolean;
}): { ok: true; remainingMs: number } | { ok: false; error: string } {
  const requested = input.requestedMs;
  if (
    requested == null ||
    requested === input.clockDurationMs ||
    requested === input.regulationMs
  ) {
    return { ok: true, remainingMs: input.clockDurationMs };
  }
  if (requested === TWENTY_SECOND_RESET_MS) {
    if (input.regulationMs <= TWENTY_SECOND_RESET_MS) {
      return {
        ok: false,
        error: "A 20-second reset needs a full shot clock longer than 20 seconds.",
      };
    }
    return { ok: true, remainingMs: TWENTY_SECOND_RESET_MS };
  }
  return {
    ok: false,
    error: "The shot clock can reset to the full possession time or to 20 seconds.",
  };
}
