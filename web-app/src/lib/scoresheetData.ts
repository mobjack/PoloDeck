import {
  eventsForGameProgressDisplay,
  formatQuarterEndedRemark,
  formatQuarterStartedRemark,
} from "./gameProgressDisplay";

export type TeamSide = "HOME" | "AWAY";

/** Minimal shape of a game event needed for scoresheet derivations. */
export interface ScoresheetEvent {
  id: string;
  eventType: string;
  payload?: unknown;
  createdAt: string;
  source?: string;
}

export const CAP_ORDER: string[] = [
  "1",
  "1A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
];

export function capSortKey(cap: string): number {
  const idx = CAP_ORDER.indexOf(cap);
  if (idx !== -1) return idx;
  const numeric = Number(cap.replace(/\D+/g, ""));
  if (!Number.isNaN(numeric)) {
    return CAP_ORDER.length + numeric;
  }
  return Number.MAX_SAFE_INTEGER;
}

/** API returns events in descending order; reducers need chronological replay. Tie-break on id for same-ms events. */
export function sortGameEventsAsc(events: { createdAt: string; id: string }[]) {
  events.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

export function goalEventDelta(payload: Record<string, unknown> | undefined): number {
  return typeof payload?.delta === "number" ? payload.delta : 1;
}

export function formatSeconds(seconds?: number): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function sortedCopy(rawEvents: ScoresheetEvent[]): ScoresheetEvent[] {
  const events = Array.isArray(rawEvents) ? [...rawEvents] : [];
  sortGameEventsAsc(events);
  return events;
}

export interface GoalsByPlayer {
  goalsByPlayerAndPeriod: Record<TeamSide, Record<string, Record<number, number>>>;
  closedPeriods: Set<number>;
}

/** Goals per cap number per period, and the set of periods that have closed. */
export function computeGoalsByPlayerAndPeriod(rawEvents: ScoresheetEvent[]): GoalsByPlayer {
  const events = sortedCopy(rawEvents);
  const goals: Record<TeamSide, Record<string, Record<number, number>>> = {
    HOME: {},
    AWAY: {},
  };
  const closedPeriods = new Set<number>();
  let currentPeriod = 1;

  for (const ev of events) {
    const p = ev.payload as Record<string, unknown> | undefined;
    if (ev.eventType === "PERIOD_ADVANCED") {
      const from = (p?.from as number) ?? 0;
      const to = (p?.to as number) ?? 1;
      if (from >= 1) closedPeriods.add(from);
      currentPeriod = to;
      continue;
    }
    if (ev.eventType === "GOAL_HOME" && p?.capNumber) {
      const cap = String(p.capNumber);
      const d = goalEventDelta(p);
      if (!goals.HOME[cap]) goals.HOME[cap] = {};
      goals.HOME[cap][currentPeriod] = Math.max(0, (goals.HOME[cap][currentPeriod] ?? 0) + d);
    }
    if (ev.eventType === "GOAL_AWAY" && p?.capNumber) {
      const cap = String(p.capNumber);
      const d = goalEventDelta(p);
      if (!goals.AWAY[cap]) goals.AWAY[cap] = {};
      goals.AWAY[cap][currentPeriod] = Math.max(0, (goals.AWAY[cap][currentPeriod] ?? 0) + d);
    }
  }

  return { goalsByPlayerAndPeriod: goals, closedPeriods };
}

export type FoulsByPlayer = Record<TeamSide, Record<string, string[]>>;

/** Up to 3 personal fouls per cap, each as `E<period>` (exclusion) or `P<period>` (penalty). */
export function computeFoulsByPlayer(rawEvents: ScoresheetEvent[]): FoulsByPlayer {
  const events = sortedCopy(rawEvents);
  const bySideCap: FoulsByPlayer = {
    HOME: {},
    AWAY: {},
  };
  let currentPeriod = 1;
  for (const ev of events) {
    const p = ev.payload as Record<string, unknown> | undefined;
    if (ev.eventType === "PERIOD_ADVANCED") {
      const to = (p?.to as number) ?? 1;
      currentPeriod = to;
      continue;
    }
    if (ev.eventType !== "EXCLUSION_STARTED") continue;
    const side = (p?.teamSide as TeamSide) ?? (p?.side as TeamSide);
    const cap = p?.capNumber as string;
    if (!side || !cap) continue;
    if (!bySideCap[side][cap]) bySideCap[side][cap] = [];
    if (bySideCap[side][cap].length >= 3) continue;
    const period = (typeof p?.period === "number" ? p.period : currentPeriod) as number;
    const letter = p?.isPenalty === true ? "P" : "E";
    bySideCap[side][cap].push(`${letter}${period}`);
  }
  return bySideCap;
}

/** Render a stored foul slot (`E1`) in the traditional slash form (`E/1`). */
export function formatFoulSlot(slot: string): string {
  const match = /^([EP])(\d+)$/.exec(slot);
  if (!match) return slot;
  return `${match[1]}/${match[2]}`;
}

export interface TimeoutCalls {
  HOME: { full: string[]; short: string[] };
  AWAY: { full: string[]; short: string[] };
}

/** Timeout calls per team as `gameTime/quarter`, split into full and short (30s). */
export function computeTimeoutCalls(rawEvents: ScoresheetEvent[]): TimeoutCalls {
  const events = sortedCopy(rawEvents);
  const bySide: TimeoutCalls = {
    HOME: { full: [], short: [] },
    AWAY: { full: [], short: [] },
  };
  let currentPeriod = 1;
  for (const ev of events) {
    const p = ev.payload as Record<string, unknown> | undefined;
    if (ev.eventType === "PERIOD_ADVANCED") {
      const to = (p?.to as number) ?? 1;
      currentPeriod = to;
      continue;
    }
    if (ev.eventType !== "TIMEOUT_USED") continue;
    const side = (p?.teamSide as TeamSide) ?? (p?.side as TeamSide);
    if (!side) continue;
    const calledAt =
      typeof p?.timeSeconds === "number" ? formatSeconds(p.timeSeconds) : "—";
    const slotValue = `${calledAt}/${currentPeriod}`;
    const timeoutType = (p?.type as string) ?? "full";
    if (timeoutType === "short") {
      bySide[side].short.push(slotValue);
    } else {
      bySide[side].full.push(slotValue);
    }
  }
  return bySide;
}

export interface PeriodScore {
  home: number;
  away: number;
}

export interface ScoreByQuarter {
  q1: PeriodScore;
  q2: PeriodScore;
  q3: PeriodScore;
  q4: PeriodScore;
  ot: PeriodScore;
  final: PeriodScore;
}

/** Per-period goal breakdown (Q1-Q4 + combined OT) plus the final score. */
export function computeScoreByQuarter(
  rawEvents: ScoresheetEvent[],
  finalHome: number,
  finalAway: number
): ScoreByQuarter {
  const events = sortedCopy(rawEvents);
  const home: Record<number, number> = {};
  const away: Record<number, number> = {};
  let currentPeriod = 1;
  for (const ev of events) {
    const p = ev.payload as Record<string, unknown> | undefined;
    if (ev.eventType === "PERIOD_ADVANCED") {
      const to = (p?.to as number) ?? currentPeriod + 1;
      currentPeriod = to;
      continue;
    }
    if (ev.eventType === "GOAL_HOME") {
      const d = goalEventDelta(p);
      home[currentPeriod] = Math.max(0, (home[currentPeriod] ?? 0) + d);
    } else if (ev.eventType === "GOAL_AWAY") {
      const d = goalEventDelta(p);
      away[currentPeriod] = Math.max(0, (away[currentPeriod] ?? 0) + d);
    }
  }
  const q = (side: TeamSide, period: number) =>
    side === "HOME" ? (home[period] ?? 0) : (away[period] ?? 0);
  const otHome = Object.entries(home)
    .filter(([period]) => Number(period) >= 5)
    .reduce((sum, [, value]) => sum + value, 0);
  const otAway = Object.entries(away)
    .filter(([period]) => Number(period) >= 5)
    .reduce((sum, [, value]) => sum + value, 0);
  return {
    q1: { home: q("HOME", 1), away: q("AWAY", 1) },
    q2: { home: q("HOME", 2), away: q("AWAY", 2) },
    q3: { home: q("HOME", 3), away: q("AWAY", 3) },
    q4: { home: q("HOME", 4), away: q("AWAY", 4) },
    ot: { home: otHome, away: otAway },
    final: { home: finalHome, away: finalAway },
  };
}

export interface ProgressRow {
  id: string;
  eventType: string;
  side?: TeamSide;
  cap: string;
  team: string;
  period: number;
  time: string;
  timeSeconds?: number;
  homeScore?: number;
  awayScore?: number;
  remark: string;
  score: string;
  isQuarterStart: boolean;
  isQuarterEnd: boolean;
  foulCount?: number;
  editable: boolean;
  /** Traditional one-letter chronology code (`G`/`E`/`P`/`T/O`...) or null if not part of the official record. */
  chronologyCode: string | null;
}

/**
 * Map every event id to the period it belongs to by replaying the *full* event
 * stream in chronological order. This must use all events (not the display-filtered
 * set) because some period transitions — e.g. `PERIOD_ADVANCED` with `fromBreak` —
 * are hidden from the progress table but still advance the period.
 */
export function computeEventPeriods(rawEvents: ScoresheetEvent[]): Map<string, number> {
  const events = sortedCopy(rawEvents);
  const periodById = new Map<string, number>();
  let currentPeriod = 1;
  for (const ev of events) {
    const p = ev.payload as Record<string, unknown> | undefined;
    let rowPeriod = currentPeriod;
    if (ev.eventType === "PERIOD_ADVANCED") {
      // The advance row itself belongs to the period that just ended.
      rowPeriod = (p?.from as number) ?? currentPeriod;
      currentPeriod = (p?.to as number) ?? currentPeriod + 1;
    } else if (ev.eventType === "GAME_CLOCK_STARTED") {
      const period = typeof p?.period === "number" ? p.period : currentPeriod;
      currentPeriod = period;
      rowPeriod = period;
    } else if (ev.eventType === "QUARTER_ENDED") {
      rowPeriod = typeof p?.afterPeriod === "number" ? p.afterPeriod : currentPeriod;
    }
    periodById.set(ev.id, rowPeriod);
  }
  return periodById;
}

/**
 * Chronological "progress of game" rows shared by the on-screen game sheet and the
 * printable scoresheet. Mirrors the legacy GameSheet mapping and additionally tracks
 * the period each row belongs to (for per-quarter scoresheet columns).
 */
export function buildProgressRows(
  rawEvents: ScoresheetEvent[],
  foulsByPlayer: FoulsByPlayer
): ProgressRow[] {
  const events = Array.isArray(rawEvents) ? rawEvents : [];
  const periodById = computeEventPeriods(events);

  return eventsForGameProgressDisplay(events).map((ev) => {
    const p = ev.payload as Record<string, unknown> | undefined;
    const side = (p?.side ?? p?.teamSide) as TeamSide | undefined;
    const team = side === "HOME" ? "Dark" : side === "AWAY" ? "Light" : "—";
    const cap = (p?.capNumber as string) ?? "—";
    const timeStr =
      typeof p?.timeSeconds === "number"
        ? `${Math.floor(p.timeSeconds / 60)}:${String(p.timeSeconds % 60).padStart(2, "0")}`
        : ev.createdAt
          ? new Date(ev.createdAt).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            })
          : "—";

    const rowPeriod = periodById.get(ev.id) ?? 1;
    let remark = "—";
    let score = "—";
    switch (ev.eventType) {
      case "GOAL_HOME":
      case "GOAL_AWAY":
        remark = "Goal";
        if (typeof p?.homeScore === "number" && typeof p?.awayScore === "number") {
          score = `${p.homeScore}-${p.awayScore}`;
        }
        break;
      case "EXCLUSION_STARTED":
        remark = p?.isPenalty === true ? "Penalty" : "Exclusion";
        break;
      case "EXCLUSION_CLEARED":
        remark = "Exclusion cleared";
        break;
      case "TIMEOUT_USED":
        remark = (p?.type as string) === "short" ? "Timeout (30s)" : "Timeout (full)";
        break;
      case "PERIOD_ADVANCED":
        remark = `End Q${(p?.from as number) ?? "?"} → Q${(p?.to as number) ?? "?"}`;
        if (typeof p?.homeScore === "number" && typeof p?.awayScore === "number") {
          score = `${p.homeScore}-${p.awayScore}`;
        }
        break;
      case "GAME_CLOCK_STARTED":
        remark = formatQuarterStartedRemark(p);
        break;
      case "QUARTER_ENDED":
        remark = formatQuarterEndedRemark(p);
        break;
      case "HORN_TRIGGERED":
        remark = "Horn";
        break;
      case "GAME_CREATED":
        remark = "Game created";
        break;
      default:
        remark = ev.eventType.replace(/_/g, " ").toLowerCase();
    }

    const isQuarterStart = ev.eventType === "GAME_CLOCK_STARTED";
    const isQuarterEnd =
      ev.eventType === "PERIOD_ADVANCED" || ev.eventType === "QUARTER_ENDED";
    const foulCount =
      ev.eventType === "EXCLUSION_STARTED" && side && cap
        ? (foulsByPlayer[side]?.[cap]?.length ?? 0)
        : undefined;

    return {
      id: ev.id,
      eventType: ev.eventType,
      side,
      cap,
      team,
      period: rowPeriod,
      time: timeStr,
      timeSeconds: typeof p?.timeSeconds === "number" ? p.timeSeconds : undefined,
      homeScore: typeof p?.homeScore === "number" ? p.homeScore : undefined,
      awayScore: typeof p?.awayScore === "number" ? p.awayScore : undefined,
      remark,
      score,
      isQuarterStart,
      isQuarterEnd,
      foulCount,
      editable: ev.eventType !== "GAME_CREATED",
      chronologyCode: chronologyEventCode(ev.eventType, p),
    };
  });
}

export type EventJustify = "left" | "center" | "right";

/**
 * Traditional one-letter event code for the chronology, or null when an event is not
 * part of the official progress-of-game record (clock ops, breaks, horn, etc.).
 */
export function chronologyEventCode(
  eventType: string,
  payload?: Record<string, unknown>
): string | null {
  switch (eventType) {
    case "GOAL_HOME":
    case "GOAL_AWAY":
      return "G";
    case "EXCLUSION_STARTED":
      return payload?.isPenalty === true ? "P" : "E";
    case "TIMEOUT_USED":
      return payload?.type === "short" ? "T/O 20" : "T/O";
    default:
      return null;
  }
}

/**
 * Event-cell justification (operator convention): goals left, exclusion/penalty fouls
 * right, timeouts and everything else centered.
 */
export function eventCellJustify(code: string): EventJustify {
  if (code === "G") return "left";
  if (code === "E" || code === "P") return "right";
  return "center";
}
