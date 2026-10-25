import { playerIsRolled } from "./rolledPlayer";

/** A second yellow card rolls the player, same as a red card. */
export const YELLOW_CARDS_TO_ROLL = 2;

export type CardColor = "YELLOW" | "RED";

export type CardTarget = "PLAYER" | "HEAD_COACH" | "ASSISTANT_COACH" | "BENCH";

export function countPlayerCards(
  payloads: unknown[],
  teamSide: string,
  capNumber: string
): { yellow: number; red: number } {
  let yellow = 0;
  let red = 0;
  for (const payload of payloads) {
    if (payload == null || typeof payload !== "object" || Array.isArray(payload)) continue;
    const record = payload as Record<string, unknown>;
    if (record.target != null && record.target !== "PLAYER") continue;
    const side = record.teamSide ?? record.side;
    if (side !== teamSide || String(record.capNumber) !== String(capNumber)) continue;
    if (record.color === "YELLOW") yellow += 1;
    else if (record.color === "RED") red += 1;
  }
  return { yellow, red };
}

/** Rolled by three personal fouls, a red card, or a second yellow card. */
export function playerIsRolledByFoulsAndCards(
  personalFouls: number,
  yellowCards: number,
  redCards: number
): boolean {
  return (
    playerIsRolled(personalFouls) ||
    yellowCards >= YELLOW_CARDS_TO_ROLL ||
    redCards >= 1
  );
}
