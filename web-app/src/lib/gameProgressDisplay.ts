/** Operational clock events hidden from the game sheet progress table. */
export const GAME_PROGRESS_HIDDEN_EVENT_TYPES = new Set<string>([
  "GAME_CLOCK_STOPPED",
  "GAME_CLOCK_SET",
  "SHOT_CLOCK_STARTED",
  "SHOT_CLOCK_STOPPED",
  "SHOT_CLOCK_RESET",
  "SHOT_CLOCK_RESET_UNDONE",
  "SHOT_CLOCK_SET",
]);

export function isGameProgressRowHidden(eventType: string): boolean {
  return GAME_PROGRESS_HIDDEN_EVENT_TYPES.has(eventType);
}

type ProgressEvent = { eventType: string; payload?: unknown };

/** Remark for QUARTER_ENDED rows (payload.afterPeriod = quarter that just ended). */
export function formatQuarterEndedRemark(
  payload: Record<string, unknown> | undefined
): string {
  const after = payload?.afterPeriod;
  if (typeof after !== "number" || after < 1) return "Quarter ended";
  if (after >= 5) return "OT Ended";
  return `Q${after} Ended`;
}

/** Remark for GAME_CLOCK_STARTED rows (payload.period from server). */
export function formatQuarterStartedRemark(
  payload: Record<string, unknown> | undefined
): string {
  const period = payload?.period;
  if (typeof period !== "number" || period < 1) return "Quarter started";
  if (period >= 5) return "OT Started";
  return `Q${period} Started`;
}

/**
 * One quarter-start row per period: keep the first GAME_CLOCK_STARTED after each
 * PERIOD_ADVANCED (or for Q1 before any advance). Later clock resumes in the same
 * period are omitted from the table.
 * PERIOD_ADVANCED with payload.fromBreak is omitted — "break ended" already marks `sq`
 * after an active break; the event stays in full history for replays.
 */
export function eventsForGameProgressDisplay<T extends ProgressEvent>(events: T[]): T[] {
  let seenQuarterStartForPeriod = false;
  const out: T[] = [];

  for (const ev of events) {
    if (ev.eventType === "PERIOD_ADVANCED") {
      seenQuarterStartForPeriod = false;
      const p = ev.payload as Record<string, unknown> | undefined;
      // After `sq` from an active break we already show "break ended"; omit duplicate "End Q1 → Q2".
      const omitFromTable = p?.fromBreak === true;
      if (!isGameProgressRowHidden(ev.eventType) && !omitFromTable) {
        out.push(ev);
      }
      continue;
    }

    if (ev.eventType === "GAME_CLOCK_STARTED") {
      if (!seenQuarterStartForPeriod) {
        seenQuarterStartForPeriod = true;
        if (!isGameProgressRowHidden(ev.eventType)) {
          out.push(ev);
        }
      }
      continue;
    }

    if (!isGameProgressRowHidden(ev.eventType)) {
      out.push(ev);
    }
  }

  return out;
}
