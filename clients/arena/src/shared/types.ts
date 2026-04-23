/** Mirrors server aggregate shape for arena clients (subset used for display). */
export interface GameAggregate {
  id: string;
  gameDayId: string | null;
  scheduledAt: string | null;
  homeTeamName: string;
  awayTeamName: string;
  level: string | null;
  gender: string | null;
  gameType: string | null;
  currentPeriod: number;
  totalPeriods: number;
  status: "PENDING" | "IN_PROGRESS" | "FINAL";
  score: {
    homeScore: number;
    awayScore: number;
  } | null;
  gameClock: {
    durationMs: number;
    remainingMs: number;
    running: boolean;
    lastStartedAt?: string | null;
  } | null;
  shotClock: {
    durationMs: number;
    remainingMs: number;
    running: boolean;
    lastStartedAt?: string | null;
  } | null;
  timeoutStates: {
    teamSide: "HOME" | "AWAY";
    fullTimeoutsRemaining: number;
    shortTimeoutsRemaining: number;
  }[];
}

export interface GameListItem {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "FINAL";
  scheduledAt: string | null;
  createdAt: string;
  homeTeamName: string;
  awayTeamName: string;
}

export interface DeviceCapabilities {
  hasScoreboard: boolean;
  hasTimer: boolean;
  hasShotClock: boolean;
  shotClockCount: number;
  mode: string;
}

export type DeviceRole = "SCOREBOARD" | "TIMER" | "SHOT_CLOCK";
