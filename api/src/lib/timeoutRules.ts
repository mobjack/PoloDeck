/** Timeout allotments copied onto a game day and each game on that day. */

export const TIMEOUT_PRESETS = [
  "USA_WATER_POLO",
  "OLYMPICS",
  "JUNIOR_OLYMPICS",
  "COLLEGE",
  "HIGH_SCHOOL",
  "CUSTOM",
] as const;

export type TimeoutPreset = (typeof TIMEOUT_PRESETS)[number];

export interface TimeoutRules {
  fullTimeoutsRegulation: number;
  /** One pool for the whole game. Unused 30-second timeouts stay available in overtime. */
  shortTimeouts: number;
  /** Fresh full-timeout count when the game enters overtime. Regulation leftovers are not added. */
  fullTimeoutsOvertime: number;
  /** When false, full timeouts are one pool for the whole game, including overtime. */
  separateOvertimeTimeouts: boolean;
  fullTimeoutDurationSec: number;
  shortTimeoutDurationSec: number;
}

export interface TimeoutRulesInput extends TimeoutRules {
  timeoutPreset: TimeoutPreset;
}

const OLYMPIC_STYLE: TimeoutRules = {
  fullTimeoutsRegulation: 2,
  shortTimeouts: 0,
  fullTimeoutsOvertime: 0,
  separateOvertimeTimeouts: true,
  fullTimeoutDurationSec: 60,
  shortTimeoutDurationSec: 30,
};

/** NCAA 2025–26 and NFHS/CIF: 3 full in regulation, 1 full in overtime, 1 shared 30-second. */
const NCAA_NFHS: TimeoutRules = {
  fullTimeoutsRegulation: 3,
  shortTimeouts: 1,
  fullTimeoutsOvertime: 1,
  separateOvertimeTimeouts: true,
  fullTimeoutDurationSec: 120,
  shortTimeoutDurationSec: 30,
};

export const TIMEOUT_PRESET_RULES: Record<
  Exclude<TimeoutPreset, "CUSTOM">,
  TimeoutRules
> = {
  USA_WATER_POLO: OLYMPIC_STYLE,
  OLYMPICS: OLYMPIC_STYLE,
  JUNIOR_OLYMPICS: OLYMPIC_STYLE,
  COLLEGE: NCAA_NFHS,
  HIGH_SCHOOL: NCAA_NFHS,
};

export const HIGH_SCHOOL_TIMEOUT_RULES: TimeoutRulesInput = {
  timeoutPreset: "HIGH_SCHOOL",
  ...NCAA_NFHS,
};

/** Existing days keep the previous whole-game pool until someone saves a preset. */
export const LEGACY_TIMEOUT_RULES: TimeoutRulesInput = {
  timeoutPreset: "CUSTOM",
  fullTimeoutsRegulation: 2,
  shortTimeouts: 1,
  fullTimeoutsOvertime: 0,
  separateOvertimeTimeouts: false,
  fullTimeoutDurationSec: 60,
  shortTimeoutDurationSec: 30,
};

export function timeoutRulesFromGame(game: TimeoutRules): TimeoutRules {
  return {
    fullTimeoutsRegulation: game.fullTimeoutsRegulation,
    shortTimeouts: game.shortTimeouts,
    fullTimeoutsOvertime: game.fullTimeoutsOvertime,
    separateOvertimeTimeouts: game.separateOvertimeTimeouts,
    fullTimeoutDurationSec: game.fullTimeoutDurationSec,
    shortTimeoutDurationSec: game.shortTimeoutDurationSec,
  };
}

type TimeoutSide = "HOME" | "AWAY";

export interface TimeoutRemaining {
  full: number;
  short: number;
}

function emptyUsed(): Record<TimeoutSide, TimeoutRemaining> {
  return {
    HOME: { full: 0, short: 0 },
    AWAY: { full: 0, short: 0 },
  };
}

function asPayload(p: unknown): Record<string, unknown> {
  return p != null && typeof p === "object" && !Array.isArray(p)
    ? (p as Record<string, unknown>)
    : {};
}

function sideOf(payload: Record<string, unknown>): TimeoutSide | null {
  const side = payload.teamSide ?? payload.side;
  return side === "HOME" || side === "AWAY" ? side : null;
}

/**
 * Remaining timeouts after replaying the event log.
 * Full timeouts used in periods 1–4 come out of the regulation pool.
 * When overtime is separate, period 5+ uses only the overtime full-timeout count.
 * Short timeouts are one shared pool for regulation and overtime.
 */
export function remainingTimeouts(
  rules: TimeoutRules,
  events: { eventType: string; payload?: unknown }[],
  currentPeriod: number
): Record<TimeoutSide, TimeoutRemaining> {
  let period = 1;
  const fullRegulation = emptyUsed();
  const fullOvertime = emptyUsed();
  const short = emptyUsed();

  for (const ev of events) {
    const payload = asPayload(ev.payload);
    if (ev.eventType === "PERIOD_ADVANCED") {
      if (typeof payload.to === "number") period = payload.to;
      continue;
    }
    if (ev.eventType !== "TIMEOUT_USED") continue;
    const side = sideOf(payload);
    if (!side) continue;
    if (payload.type === "short") {
      short[side].short += 1;
      continue;
    }
    if (period > 4) fullOvertime[side].full += 1;
    else fullRegulation[side].full += 1;
  }

  const inOvertime = rules.separateOvertimeTimeouts && currentPeriod > 4;
  const result = emptyUsed();
  for (const side of ["HOME", "AWAY"] as const) {
    const fullAllotment = !rules.separateOvertimeTimeouts
      ? rules.fullTimeoutsRegulation
      : inOvertime
        ? rules.fullTimeoutsOvertime
        : rules.fullTimeoutsRegulation;
    const fullUsed = !rules.separateOvertimeTimeouts
      ? fullRegulation[side].full + fullOvertime[side].full
      : inOvertime
        ? fullOvertime[side].full
        : fullRegulation[side].full;
    result[side] = {
      full: Math.max(0, fullAllotment - fullUsed),
      short: Math.max(0, rules.shortTimeouts - short[side].short),
    };
  }
  return result;
}
