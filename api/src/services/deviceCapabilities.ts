export type GameMode =
  | "manual_only"
  | "scoreboard_only"
  | "scoreboard_and_shot_clock";

export interface DeviceSummary {
  id: string;
  clientId: string;
  type: "SCOREBOARD" | "SHOT_CLOCK" | "TIMER";
  name?: string | null;
  lastCheckInAt: string;
}

export interface DeviceCapabilities {
  hasScoreboard: boolean;
  hasTimer: boolean;
  hasShotClock: boolean;
  shotClockCount: number;
  mode: GameMode;
  scoreboards: DeviceSummary[];
  timers: DeviceSummary[];
  shotClocks: DeviceSummary[];
}

export function buildDeviceCapabilities(input: {
  now: Date;
  devices: DeviceSummary[];
  staleAfterMs: number;
}): DeviceCapabilities {
  const { now, devices, staleAfterMs } = input;
  const freshDevices = devices.filter((d) => {
    const last = new Date(d.lastCheckInAt).getTime();
    return now.getTime() - last <= staleAfterMs;
  });

  const scoreboards = freshDevices.filter((d) => d.type === "SCOREBOARD");
  const timers = freshDevices.filter((d) => d.type === "TIMER");
  const shotClocks = freshDevices.filter((d) => d.type === "SHOT_CLOCK");

  const hasScoreboard = scoreboards.length > 0;
  const hasTimer = timers.length > 0;
  const hasShotClock = shotClocks.length > 0;

  let mode: GameMode = "manual_only";
  if (hasScoreboard && hasShotClock) {
    mode = "scoreboard_and_shot_clock";
  } else if (hasScoreboard) {
    mode = "scoreboard_only";
  }

  return {
    hasScoreboard,
    hasTimer,
    hasShotClock,
    shotClockCount: shotClocks.length,
    mode,
    scoreboards,
    timers,
    shotClocks,
  };
}

