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
