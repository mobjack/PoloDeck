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
