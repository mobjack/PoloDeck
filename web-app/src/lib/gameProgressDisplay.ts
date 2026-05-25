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

/**
 * One "Quarter started" per period: keep the first GAME_CLOCK_STARTED after each
 * PERIOD_ADVANCED (or for Q1 before any advance). Later clock resumes in the same
 * period are omitted from the table.
 */
export function eventsForGameProgressDisplay<T extends ProgressEvent>(events: T[]): T[] {
  let seenQuarterStartForPeriod = false;
  const out: T[] = [];

  for (const ev of events) {
    if (ev.eventType === "PERIOD_ADVANCED") {
      seenQuarterStartForPeriod = false;
      if (!isGameProgressRowHidden(ev.eventType)) {
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
