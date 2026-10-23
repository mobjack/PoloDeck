/** Exclusions and penalties together. The third rolls the player out. */
export const PERSONAL_FOULS_TO_ROLL = 3;

export const ROLLED_PLAYER_MESSAGE = "Player has been rolled from the game";

export function countPersonalFouls(
  payloads: unknown[],
  teamSide: string,
  capNumber: string
): number {
  return payloads.filter((payload) => personalFoulMatches(payload, teamSide, capNumber))
    .length;
}

export function playerIsRolled(personalFoulCount: number): boolean {
  return personalFoulCount >= PERSONAL_FOULS_TO_ROLL;
}

function personalFoulMatches(
  payload: unknown,
  teamSide: string,
  capNumber: string
): boolean {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  const side = record.teamSide ?? record.side;
  return side === teamSide && String(record.capNumber) === String(capNumber);
}
