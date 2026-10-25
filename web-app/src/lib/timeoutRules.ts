export const TIMEOUT_PRESETS = [
  "USA_WATER_POLO",
  "OLYMPICS",
  "JUNIOR_OLYMPICS",
  "COLLEGE",
  "HIGH_SCHOOL",
  "CUSTOM",
] as const;

export type TimeoutPreset = (typeof TIMEOUT_PRESETS)[number];

export interface TimeoutRulesInput {
  timeoutPreset: TimeoutPreset;
  fullTimeoutsRegulation: number;
  shortTimeouts: number;
  fullTimeoutsOvertime: number;
  separateOvertimeTimeouts: boolean;
  fullTimeoutDurationSec: number;
  shortTimeoutDurationSec: number;
}

interface PresetDefinition extends Omit<TimeoutRulesInput, "timeoutPreset"> {
  label: string;
  summary: string;
}

const OLYMPIC_STYLE: Omit<TimeoutRulesInput, "timeoutPreset"> = {
  fullTimeoutsRegulation: 2,
  shortTimeouts: 0,
  fullTimeoutsOvertime: 0,
  separateOvertimeTimeouts: true,
  fullTimeoutDurationSec: 60,
  shortTimeoutDurationSec: 30,
};

const NCAA_NFHS: Omit<TimeoutRulesInput, "timeoutPreset"> = {
  fullTimeoutsRegulation: 3,
  shortTimeouts: 1,
  fullTimeoutsOvertime: 1,
  separateOvertimeTimeouts: true,
  fullTimeoutDurationSec: 120,
  shortTimeoutDurationSec: 30,
};

export const TIMEOUT_PRESET_DETAILS: Record<
  Exclude<TimeoutPreset, "CUSTOM">,
  PresetDefinition
> = {
  USA_WATER_POLO: {
    label: "USA Water Polo",
    summary:
      "2 one-minute timeouts per game. Tied games use a penalty shootout, so overtime timeouts start at 0.",
    ...OLYMPIC_STYLE,
  },
  OLYMPICS: {
    label: "Olympics",
    summary:
      "World Aquatics: 2 one-minute timeouts per game. Tied games use a penalty shootout, so overtime timeouts start at 0.",
    ...OLYMPIC_STYLE,
  },
  JUNIOR_OLYMPICS: {
    label: "Junior Olympics",
    summary:
      "USA Water Polo Junior Olympics: 2 one-minute timeouts per game. Tied games use a penalty shootout, so overtime timeouts start at 0.",
    ...OLYMPIC_STYLE,
  },
  COLLEGE: {
    label: "College (NCAA)",
    summary:
      "3 full timeouts (up to 2 minutes) in regulation, 1 full timeout in overtime, and 1 thirty-second timeout that can be used in regulation or overtime.",
    ...NCAA_NFHS,
  },
  HIGH_SCHOOL: {
    label: "High school (NFHS)",
    summary:
      "3 full timeouts (up to 2 minutes) in regulation, 1 full timeout in overtime, and 1 thirty-second timeout that can be used in regulation or overtime.",
    ...NCAA_NFHS,
  },
};

export const HIGH_SCHOOL_TIMEOUT_RULES: TimeoutRulesInput = {
  timeoutPreset: "HIGH_SCHOOL",
  ...NCAA_NFHS,
};

export function presetLabel(preset: TimeoutPreset): string {
  if (preset === "CUSTOM") return "Custom";
  return TIMEOUT_PRESET_DETAILS[preset].label;
}

export function rulesMatchPreset(rules: TimeoutRulesInput): boolean {
  if (rules.timeoutPreset === "CUSTOM") return true;
  const preset = TIMEOUT_PRESET_DETAILS[rules.timeoutPreset];
  return (
    rules.fullTimeoutsRegulation === preset.fullTimeoutsRegulation &&
    rules.shortTimeouts === preset.shortTimeouts &&
    rules.fullTimeoutsOvertime === preset.fullTimeoutsOvertime &&
    rules.separateOvertimeTimeouts === preset.separateOvertimeTimeouts &&
    rules.fullTimeoutDurationSec === preset.fullTimeoutDurationSec &&
    rules.shortTimeoutDurationSec === preset.shortTimeoutDurationSec
  );
}

export function applyTimeoutPreset(preset: TimeoutPreset, current: TimeoutRulesInput): TimeoutRulesInput {
  if (preset === "CUSTOM") return { ...current, timeoutPreset: "CUSTOM" };
  const details = TIMEOUT_PRESET_DETAILS[preset];
  return {
    timeoutPreset: preset,
    fullTimeoutsRegulation: details.fullTimeoutsRegulation,
    shortTimeouts: details.shortTimeouts,
    fullTimeoutsOvertime: details.fullTimeoutsOvertime,
    separateOvertimeTimeouts: details.separateOvertimeTimeouts,
    fullTimeoutDurationSec: details.fullTimeoutDurationSec,
    shortTimeoutDurationSec: details.shortTimeoutDurationSec,
  };
}

export function describeTimeoutRules(rules: TimeoutRulesInput): string {
  const fullLength =
    rules.fullTimeoutDurationSec % 60 === 0
      ? `${rules.fullTimeoutDurationSec / 60} min`
      : `${rules.fullTimeoutDurationSec}s`;
  const overtime = rules.separateOvertimeTimeouts
    ? `${rules.fullTimeoutsOvertime} full in overtime`
    : "full timeouts do not reset in overtime";
  const short =
    rules.shortTimeouts > 0
      ? `, ${rules.shortTimeouts} × ${rules.shortTimeoutDurationSec}s (regulation or overtime)`
      : "";
  return `${presetLabel(rules.timeoutPreset)}: ${rules.fullTimeoutsRegulation} full (${fullLength}) in regulation, ${overtime}${short}`;
}

export function fullTimeoutColumnCount(
  rules: Pick<
    TimeoutRulesInput,
    "fullTimeoutsRegulation" | "fullTimeoutsOvertime" | "separateOvertimeTimeouts"
  >,
  usedFull: number
): number {
  const allotted = rules.separateOvertimeTimeouts
    ? rules.fullTimeoutsRegulation + rules.fullTimeoutsOvertime
    : rules.fullTimeoutsRegulation;
  return Math.max(allotted, usedFull, 1);
}

export function shortTimeoutLabel(durationSec: number): string {
  return `${durationSec}s`;
}

/** Header label for a timeout length from the game day settings. */
export function timeoutLengthLabel(durationSec: number): string {
  if (durationSec > 0 && durationSec % 60 === 0) return `${durationSec / 60}:00`;
  return `${durationSec}s`;
}

export interface TimeoutCallLists {
  full: string[];
  short: string[];
}

export interface TimeoutMatrixColumn {
  key: string;
  label: string;
  home: string | null;
  away: string | null;
}

function slotPeriod(slot: string): number {
  const slash = slot.lastIndexOf("/");
  const period = Number(slash >= 0 ? slot.slice(slash + 1) : slot);
  return Number.isFinite(period) ? period : 1;
}

function splitFullCalls(slots: string[], separateOvertime: boolean): { regulation: string[]; overtime: string[] } {
  const regulation: string[] = [];
  const overtime: string[] = [];
  for (const slot of slots) {
    if (separateOvertime && slotPeriod(slot) > 4) overtime.push(slot);
    else regulation.push(slot);
  }
  return { regulation, overtime };
}

/**
 * One column per timeout the game day allows: each full timeout, each overtime
 * timeout when overtime has its own count, and each short timeout. A call past
 * the allotment still gets a column so it stays visible.
 */
export function buildTimeoutMatrix(
  rules: Pick<
    TimeoutRulesInput,
    | "fullTimeoutsRegulation"
    | "fullTimeoutsOvertime"
    | "separateOvertimeTimeouts"
    | "shortTimeouts"
    | "fullTimeoutDurationSec"
    | "shortTimeoutDurationSec"
  >,
  calls: { HOME: TimeoutCallLists; AWAY: TimeoutCallLists }
): TimeoutMatrixColumn[] {
  const separate = rules.separateOvertimeTimeouts;
  const homeFull = splitFullCalls(calls.HOME.full, separate);
  const awayFull = splitFullCalls(calls.AWAY.full, separate);
  const fullLabel = timeoutLengthLabel(rules.fullTimeoutDurationSec);
  const shortLabel = timeoutLengthLabel(rules.shortTimeoutDurationSec);
  const fullCount = Math.max(
    rules.fullTimeoutsRegulation,
    homeFull.regulation.length,
    awayFull.regulation.length
  );
  const overtimeCount = separate
    ? Math.max(rules.fullTimeoutsOvertime, homeFull.overtime.length, awayFull.overtime.length)
    : 0;
  const shortCount = Math.max(rules.shortTimeouts, calls.HOME.short.length, calls.AWAY.short.length);

  const columns: TimeoutMatrixColumn[] = [];
  for (let index = 0; index < fullCount; index += 1) {
    columns.push({
      key: `full-${index}`,
      label: fullLabel,
      home: homeFull.regulation[index] ?? null,
      away: awayFull.regulation[index] ?? null,
    });
  }
  for (let index = 0; index < overtimeCount; index += 1) {
    columns.push({
      key: `ot-${index}`,
      label: overtimeCount === 1 ? "OT" : `OT ${index + 1}`,
      home: homeFull.overtime[index] ?? null,
      away: awayFull.overtime[index] ?? null,
    });
  }
  for (let index = 0; index < shortCount; index += 1) {
    columns.push({
      key: `short-${index}`,
      label: shortLabel,
      home: calls.HOME.short[index] ?? null,
      away: calls.AWAY.short[index] ?? null,
    });
  }
  return columns;
}

/**
 * USA Water Polo (including Junior Olympics) and Olympic-style play reset to 20 seconds
 * when the offense keeps the ball after a shot. NCAA and NFHS reset to the full 30.
 * World Aquatics' July 2025 book uses 28 seconds and an 18-second reset; this app's
 * shortened reset stays at 20 seconds beside the 30-second full reset.
 */
export function presetUsesTwentySecondReset(preset: TimeoutPreset): boolean {
  return preset === "USA_WATER_POLO" || preset === "OLYMPICS" || preset === "JUNIOR_OLYMPICS";
}

export function presetShotClockNote(preset: TimeoutPreset): string | null {
  switch (preset) {
    case "USA_WATER_POLO":
      return "USA Water Polo uses a 30-second possession clock, and a 20-second reset when the attacking team keeps the ball after a shot, on a corner, or after an exclusion.";
    case "JUNIOR_OLYMPICS":
      return "Junior Olympics follow USA Water Polo: a 30-second possession clock, and a 20-second reset when the offense keeps the ball after a shot.";
    case "OLYMPICS":
      return "Olympic-style play uses a shortened reset after the offense keeps the ball. This option is 20 seconds with a 30-second full reset. The July 2025 World Aquatics book uses 28 seconds and an 18-second reset.";
    case "COLLEGE":
      return "NCAA resets the shot clock to the full 30 seconds after a shot, including when the offense keeps the rebound. The 20-second count in the NCAA book is the exclusion period.";
    case "HIGH_SCHOOL":
      return "NFHS uses a 30-second possession clock and resets to 30 seconds after a shot.";
    default:
      return null;
  }
}
