export interface GameDay {
  id: string;
  date: string;
  location: string;
  defaultQuarterDurationMs: number;
  defaultBreakBetweenQuartersMs: number;
  defaultHalftimeDurationMs: number;
  createdAt: string;
  updatedAt: string;
  games: GameOnDay[];
}

export interface GameOnDay {
  id: string;
  gameDayId: string | null;
  scheduledAt: string | null;
  homeTeamName: string;
  awayTeamName: string;
  level: string | null;
  gender: string | null;
  gameType: string | null;
  orderInDay: number | null;
  currentPeriod: number;
  totalPeriods: number;
  status: string;
  score: {
    homeScore: number;
    awayScore: number;
  } | null;
  quarterDurationMs: number;
  breakBetweenQuartersDurationMs: number;
  halftimeDurationMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGameDayInput {
  date: string;
  location: string;
  defaultQuarterDurationMs: number;
  defaultBreakBetweenQuartersMs: number;
  defaultHalftimeDurationMs: number;
}

export interface UpdateGameDayInput {
  date?: string;
  location?: string;
  defaultQuarterDurationMs?: number;
  defaultBreakBetweenQuartersMs?: number;
  defaultHalftimeDurationMs?: number;
}

export interface CreateGameInput {
  gameDayId?: string;
  scheduledAt?: string;
  homeTeamName: string;
  awayTeamName: string;
  level?: string;
  gender?: string;
  gameType?: string;
  quarterDurationMs?: number;
  breakBetweenQuartersDurationMs?: number;
  halftimeDurationMs?: number;
}

export interface UpdateGameInput {
  scheduledAt?: string | null;
  homeTeamName?: string;
  awayTeamName?: string;
  level?: string | null;
  gender?: string | null;
  gameType?: string | null;
  orderInDay?: number | null;
  quarterDurationMs?: number;
  breakBetweenQuartersDurationMs?: number;
  halftimeDurationMs?: number;
  status?: "PENDING" | "IN_PROGRESS" | "FINAL";
}
