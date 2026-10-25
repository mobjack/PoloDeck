export type TeamSide = "HOME" | "AWAY";

export type CardColor = "YELLOW" | "RED" | "YELLOW_RED";

export type CardTarget = "PLAYER" | "HEAD_COACH" | "ASSISTANT_COACH" | "BENCH";

export interface CardTally {
  yellow: number;
  red: number;
  /** NCAA-style yellow and red shown together. Head coach only; does not dismiss them. */
  yellowRed: number;
}

export interface ParsedCardRest {
  color: CardColor;
  side: TeamSide;
  target: CardTarget;
  capNumber?: string;
}

const DARK = "bd";

const COLOR_ACTION: Record<string, CardColor> = {
  yc: "YELLOW",
  rc: "RED",
  yrc: "YELLOW_RED",
};

const ACTION_LETTER: Record<CardColor, string> = {
  YELLOW: "yc",
  RED: "rc",
  YELLOW_RED: "yrc",
};

const CARD_ACTION = "yrc|yc|rc";

const ROLE_LETTER: Record<string, Exclude<CardTarget, "PLAYER">> = {
  h: "HEAD_COACH",
  a: "ASSISTANT_COACH",
  n: "BENCH",
};

const ROLE_COMMAND: Record<Exclude<CardTarget, "PLAYER">, string> = {
  HEAD_COACH: "h",
  ASSISTANT_COACH: "a",
  BENCH: "n",
};

export function staffCapCode(target: unknown): string | null {
  switch (target) {
    case "HEAD_COACH":
      return "H";
    case "ASSISTANT_COACH":
      return "A";
    case "BENCH":
      return "N";
    default:
      return null;
  }
}

export function staffCardLabel(target: unknown): string | null {
  switch (target) {
    case "HEAD_COACH":
      return "head coach";
    case "ASSISTANT_COACH":
      return "assistant coach";
    case "BENCH":
      return "bench";
    default:
      return null;
  }
}

function sideFromChar(char: string): TeamSide {
  return DARK.includes(char) ? "HOME" : "AWAY";
}

/**
 * Card command after the optional clock prefix has been removed.
 * Players: `b2yc` / `yc2w` (yellow) and `b2rc` / `rc2w` (red).
 * Staff, no cap: `ychb` / `bych` yellow head coach, `rcaw` red assistant, `ycnb` yellow bench.
 * `yrchb` is the yellow/red card shown together, head coach only.
 * Role letters: h head coach, a assistant, n bench.
 */
export function parseCardRest(rest: string): ParsedCardRest | null {
  const playerStandard = new RegExp(`^([bdwl])(\\d+)(${CARD_ACTION})$`);
  const playerSwapped = new RegExp(`^(${CARD_ACTION})(\\d+)([bdwl])$`);
  const staffStandard = new RegExp(`^([bdwl])(${CARD_ACTION})([han])$`);
  const staffSwapped = new RegExp(`^(${CARD_ACTION})([han])([bdwl])$`);

  const player = rest.match(playerStandard) ?? rest.match(playerSwapped);
  if (player) {
    const teamFirst = DARK.includes(player[1]) || "wl".includes(player[1]);
    const sideChar = teamFirst ? player[1] : player[3];
    const capNumber = player[2];
    const color = COLOR_ACTION[teamFirst ? player[3] : player[1]];
    if (!color) return null;
    return { color, side: sideFromChar(sideChar), target: "PLAYER", capNumber };
  }

  const staff = rest.match(staffStandard) ?? rest.match(staffSwapped);
  if (!staff) return null;
  const teamFirst = staff[2] === "yc" || staff[2] === "rc" || staff[2] === "yrc";
  const sideChar = teamFirst ? staff[1] : staff[3];
  const color = COLOR_ACTION[teamFirst ? staff[2] : staff[1]];
  const target = ROLE_LETTER[teamFirst ? staff[3] : staff[2]];
  if (!color || !target) return null;
  return { color, side: sideFromChar(sideChar), target };
}

export function formatCardCommand(input: {
  side: TeamSide;
  color: CardColor;
  target: CardTarget;
  capNumber?: string;
  timePrefix?: string;
}): string {
  const prefix = input.timePrefix ?? "";
  const team = input.side === "HOME" ? "b" : "w";
  const action = ACTION_LETTER[input.color];
  if (input.target === "PLAYER") {
    return `${prefix}${team}${input.capNumber?.trim() || "?"}${action}`;
  }
  return `${prefix}${action}${ROLE_COMMAND[input.target]}${team}`;
}

export interface CardsBySide {
  players: Record<TeamSide, Record<string, CardTally>>;
  staff: Record<TeamSide, Record<Exclude<CardTarget, "PLAYER">, CardTally>>;
}

function emptyTally(): CardTally {
  return { yellow: 0, red: 0, yellowRed: 0 };
}

function emptyStaff(): Record<Exclude<CardTarget, "PLAYER">, CardTally> {
  return {
    HEAD_COACH: emptyTally(),
    ASSISTANT_COACH: emptyTally(),
    BENCH: emptyTally(),
  };
}

export function emptyCards(): CardsBySide {
  return {
    players: { HOME: {}, AWAY: {} },
    staff: { HOME: emptyStaff(), AWAY: emptyStaff() },
  };
}

export function computeCards(
  rawEvents: { eventType: string; payload?: unknown }[]
): CardsBySide {
  const cards = emptyCards();
  for (const ev of rawEvents) {
    if (ev.eventType !== "CARD_ISSUED") continue;
    const p = ev.payload as Record<string, unknown> | undefined;
    const side = (p?.teamSide ?? p?.side) as TeamSide | undefined;
    if (side !== "HOME" && side !== "AWAY") continue;
    const field =
      p?.color === "RED" ? "red" : p?.color === "YELLOW" ? "yellow" : p?.color === "YELLOW_RED" ? "yellowRed" : null;
    if (!field) continue;
    if (p?.target === "PLAYER") {
      if (field === "yellowRed") continue;
      const cap = p.capNumber != null ? String(p.capNumber) : "";
      if (!cap) continue;
      const tally = cards.players[side][cap] ?? emptyTally();
      tally[field] += 1;
      cards.players[side][cap] = tally;
      continue;
    }
    if (p?.target === "HEAD_COACH" || p?.target === "ASSISTANT_COACH" || p?.target === "BENCH") {
      cards.staff[side][p.target][field] += 1;
    }
  }
  return cards;
}

/** Same roll rule as the API: three personal fouls, two yellows, or one red. */
export function isPlayerRolled(personalFouls: number, cards?: CardTally): boolean {
  return personalFouls >= 3 || (cards?.yellow ?? 0) >= 2 || (cards?.red ?? 0) >= 1;
}
