import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import { api, type GameAggregate } from "../api/client";
import { ApiErrorDisplay } from "../components/DatabaseUnavailable";
import type { GameDay } from "../types/gameDay";

type TeamSide = "HOME" | "AWAY";

const CAP_ORDER: string[] = [
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

function capSortKey(cap: string): number {
  const idx = CAP_ORDER.indexOf(cap);
  if (idx !== -1) return idx;
  // Fallback: try numeric, then string order at the end
  const numeric = Number(cap.replace(/\D+/g, ""));
  if (!Number.isNaN(numeric)) {
    return CAP_ORDER.length + numeric;
  }
  return Number.MAX_SAFE_INTEGER;
}

/** API returns events in descending order; reducers need chronological replay. Tie-break on id for same-ms events. */
function sortGameEventsAsc(events: { createdAt: string; id: string }[]) {
  events.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

function goalEventDelta(payload: Record<string, unknown> | undefined): number {
  return typeof payload?.delta === "number" ? payload.delta : 1;
}

interface ParsedInput {
  raw: string;
  type: "START_QUARTER" | "END_QUARTER" | "GOAL" | "EXCLUSION" | "PENALTY" | "TIMEOUT" | "TIMEOUT_30";
  timeSeconds?: number;
  side?: TeamSide;
  capNumber?: string;
}

export function GameSheet() {
  const { id: gameDayId, gameId } = useParams<{ id: string; gameId: string }>();
  const [gameDay, setGameDay] = useState<GameDay | null>(null);
  const [aggregate, setAggregate] = useState<GameAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [lastParsed, setLastParsed] = useState<ParsedInput | null>(null);
  const [commandHelpOpen, setCommandHelpOpen] = useState(false);
  const [timeoutsModalOpen, setTimeoutsModalOpen] = useState(false);
  const [scoreResultsModalOpen, setScoreResultsModalOpen] = useState(false);
  const [eqOvertimeModalOpen, setEqOvertimeModalOpen] = useState(false);
  const [eqEditEntriesModalOpen, setEqEditEntriesModalOpen] = useState(false);
  const pendingEditModalAfterEnd = useRef(false);
  const [progressEditOpen, setProgressEditOpen] = useState(false);
  const [progressEditEvents, setProgressEditEvents] = useState<GameAggregate["events"] | null>(null);
  const [progressEditSelectedId, setProgressEditSelectedId] = useState<string | null>(null);
  const [progressEditError, setProgressEditError] = useState<string | null>(null);
  const [progressEditBusy, setProgressEditBusy] = useState(false);
  const [progressInsertMode, setProgressInsertMode] = useState<null | "before" | "after">(null);
  const [insertKind, setInsertKind] = useState<
    "GOAL" | "EXCLUSION" | "PENALTY" | "TIMEOUT" | "TIMEOUT_30"
  >("GOAL");
  const [insertSide, setInsertSide] = useState<TeamSide>("HOME");
  const [insertCap, setInsertCap] = useState("");
  const [insertTimeSec, setInsertTimeSec] = useState("");
  const [gfSide, setGfSide] = useState<TeamSide>("HOME");
  const [gfCap, setGfCap] = useState("");
  const [gfTime, setGfTime] = useState("");
  const [exPenalty, setExPenalty] = useState(false);
  const [exTime, setExTime] = useState("");
  const [toSide, setToSide] = useState<TeamSide>("HOME");
  const [toShort, setToShort] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!commandHelpOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCommandHelpOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [commandHelpOpen]);

  useEffect(() => {
    if (!progressEditOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setProgressEditOpen(false);
        setProgressInsertMode(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [progressEditOpen]);

  const progressSelected =
    progressEditEvents?.find((e) => e.id === progressEditSelectedId) ?? null;

  useEffect(() => {
    if (!progressEditOpen || !progressSelected) return;
    const p = progressSelected.payload as Record<string, unknown>;
    if (
      progressSelected.eventType === "GOAL_HOME" ||
      progressSelected.eventType === "GOAL_AWAY"
    ) {
      setGfSide(progressSelected.eventType === "GOAL_HOME" ? "HOME" : "AWAY");
      setGfCap(String(p.capNumber ?? ""));
      setGfTime(
        typeof p.timeSeconds === "number"
          ? formatGameClockTimeForInput(p.timeSeconds)
          : ""
      );
    }
    if (progressSelected.eventType === "EXCLUSION_STARTED") {
      setExPenalty(p.isPenalty === true);
      setExTime(
        typeof p.timeSeconds === "number"
          ? formatGameClockTimeForInput(p.timeSeconds)
          : ""
      );
    }
    if (progressSelected.eventType === "TIMEOUT_USED") {
      const side = (p.teamSide ?? p.side) as TeamSide;
      if (side === "HOME" || side === "AWAY") setToSide(side);
      setToShort(p.type === "short");
    }
  }, [progressEditOpen, progressEditSelectedId, progressSelected?.id, progressSelected?.eventType]);

  useEffect(() => {
    if (!gameDayId || !gameId) return;
    setLoading(true);
    let socket: Socket | null = null;

    Promise.all([api.gameDays.get(gameDayId), api.games.getAggregate(gameId)])
      .then(([gd, agg]) => {
        setGameDay(gd);
        setAggregate(agg);

        // Live updates via Socket.IO
        socket = io(import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3000", {
          transports: ["websocket"],
        });
        socket.emit("game:join", { gameId });
        socket.on("game:stateUpdated", (payload: { gameId: string; aggregate: GameAggregate }) => {
          if (payload.gameId === gameId) {
            setAggregate(payload.aggregate);
          }
        });
      })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));

    return () => {
      if (socket) {
        socket.emit("game:leave", { gameId });
        socket.disconnect();
      }
    };
  }, [gameDayId, gameId]);

  const { goalsByPlayerAndPeriod, closedPeriods } = useMemo(() => {
    const raw = aggregate?.events;
    const events = Array.isArray(raw) ? [...raw] : [];
    sortGameEventsAsc(events);
    type Side = "HOME" | "AWAY";
    const goals: Record<Side, Record<string, Record<number, number>>> = {
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

    return {
      goalsByPlayerAndPeriod: goals,
      closedPeriods,
    };
  }, [aggregate?.events]);

  const foulsByPlayer = useMemo(() => {
    const raw = aggregate?.events;
    const eventList = Array.isArray(raw) ? [...raw] : [];
    sortGameEventsAsc(eventList);
    type Side = "HOME" | "AWAY";
    const bySideCap: Record<Side, Record<string, string[]>> = {
      HOME: {},
      AWAY: {},
    };
    let currentPeriod = 1;
    for (const ev of eventList) {
      const p = ev.payload as Record<string, unknown> | undefined;
      if (ev.eventType === "PERIOD_ADVANCED") {
        const to = (p?.to as number) ?? 1;
        currentPeriod = to;
        continue;
      }
      if (ev.eventType !== "EXCLUSION_STARTED") continue;
      const side = (p?.teamSide as Side) ?? (p?.side as Side);
      const cap = p?.capNumber as string;
      if (!side || !cap) continue;
      if (!bySideCap[side][cap]) bySideCap[side][cap] = [];
      if (bySideCap[side][cap].length >= 3) continue;
      const period = (typeof p?.period === "number" ? p.period : currentPeriod) as number;
      const letter = p?.isPenalty === true ? "P" : "E";
      bySideCap[side][cap].push(`${letter}${period}`);
    }
    return bySideCap;
  }, [aggregate?.events]);

  const timeoutCalls = useMemo(() => {
    const raw = aggregate?.events;
    const events = Array.isArray(raw) ? [...raw] : [];
    sortGameEventsAsc(events);
    const bySide = {
      HOME: { full: [] as string[], short: [] as string[] },
      AWAY: { full: [] as string[], short: [] as string[] },
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
  }, [aggregate?.events]);

  const scoreByQuarter = useMemo(() => {
    const raw = aggregate?.events;
    const events = Array.isArray(raw) ? [...raw] : [];
    sortGameEventsAsc(events);
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
    const q = (side: "HOME" | "AWAY", period: number) =>
      side === "HOME" ? (home[period] ?? 0) : (away[period] ?? 0);
    const otHome = Object.entries(home)
      .filter(([period]) => Number(period) >= 5)
      .reduce((sum, [, value]) => sum + value, 0);
    const otAway = Object.entries(away)
      .filter(([period]) => Number(period) >= 5)
      .reduce((sum, [, value]) => sum + value, 0);
    const finalHome = aggregate?.score?.homeScore ?? 0;
    const finalAway = aggregate?.score?.awayScore ?? 0;
    return {
      q1: { home: q("HOME", 1), away: q("AWAY", 1) },
      q2: { home: q("HOME", 2), away: q("AWAY", 2) },
      q3: { home: q("HOME", 3), away: q("AWAY", 3) },
      q4: { home: q("HOME", 4), away: q("AWAY", 4) },
      ot: { home: otHome, away: otAway },
      final: { home: finalHome, away: finalAway },
    };
  }, [aggregate?.events, aggregate?.score?.homeScore, aggregate?.score?.awayScore]);

  if (loading) return <div className="page"><p>Loading…</p></div>;
  if (error) return <ApiErrorDisplay error={error} />;
  if (!gameDay || !aggregate) return <div className="page"><p>Game not found.</p></div>;

  const homeScore = aggregate.score?.homeScore ?? 0;
  const awayScore = aggregate.score?.awayScore ?? 0;
  const isGameOver =
    aggregate.status === "FINAL" ||
    (aggregate.currentPeriod >= aggregate.totalPeriods && !aggregate.gameClock?.running);
  const homeTimeouts = aggregate.timeoutStates?.find((t) => t.teamSide === "HOME");
  const awayTimeouts = aggregate.timeoutStates?.find((t) => t.teamSide === "AWAY");

  const homePlayers = (aggregate.players ?? [])
    .filter((p) => p.teamSide === "HOME" && p.playerName.trim().length > 0)
    .sort((a, b) => capSortKey(a.capNumber) - capSortKey(b.capNumber));
  const awayPlayers = (aggregate.players ?? [])
    .filter((p) => p.teamSide === "AWAY" && p.playerName.trim().length > 0)
    .sort((a, b) => capSortKey(a.capNumber) - capSortKey(b.capNumber));

  const maxRosterRows = Math.max(homePlayers.length, awayPlayers.length);

  const getGoalsForPlayer = (
    side: "HOME" | "AWAY",
    capNumber: string
  ): { q1: number | "—"; q2: number | "—"; q3: number | "—"; q4: number | "—"; ot: number; tot: number } => {
    const byPeriod = goalsByPlayerAndPeriod[side]?.[capNumber];
    if (!byPeriod) {
      return { q1: "—", q2: "—", q3: "—", q4: "—", ot: 0, tot: 0 };
    }
    const q1 = closedPeriods.has(1) ? (byPeriod[1] ?? 0) : "—";
    const q2 = closedPeriods.has(2) ? (byPeriod[2] ?? 0) : "—";
    const q3 = closedPeriods.has(3) ? (byPeriod[3] ?? 0) : "—";
    const q4 = closedPeriods.has(4) ? (byPeriod[4] ?? 0) : "—";
    let ot = 0;
    let tot = 0;
    for (const [periodStr, count] of Object.entries(byPeriod)) {
      const period = Number(periodStr);
      if (!Number.isInteger(period) || count === undefined) continue;
      if (closedPeriods.has(period)) {
        tot += count;
        if (period >= 5) ot += count;
      }
    }
    return { q1, q2, q3, q4, ot, tot };
  };

  const sumRosterGoals = (
    side: "HOME" | "AWAY",
    players: typeof homePlayers
  ): { q1: number; q2: number; q3: number; q4: number; ot: number; tot: number } => {
    const totals = { q1: 0, q2: 0, q3: 0, q4: 0, ot: 0, tot: 0 };
    for (const p of players) {
      const g = getGoalsForPlayer(side, p.capNumber);
      totals.q1 += typeof g.q1 === "number" ? g.q1 : 0;
      totals.q2 += typeof g.q2 === "number" ? g.q2 : 0;
      totals.q3 += typeof g.q3 === "number" ? g.q3 : 0;
      totals.q4 += typeof g.q4 === "number" ? g.q4 : 0;
      totals.ot += g.ot;
      totals.tot += g.tot;
    }
    return totals;
  };
  const homeRosterTotals = sumRosterGoals("HOME", homePlayers);
  const awayRosterTotals = sumRosterGoals("AWAY", awayPlayers);

  const getFoulSlots = (side: "HOME" | "AWAY", capNumber: string): [string, string, string] => {
    const arr = foulsByPlayer[side]?.[capNumber] ?? [];
    return [arr[0] ?? "—", arr[1] ?? "—", arr[2] ?? "—"];
  };

  const formatMsToClock = (ms: number | null | undefined) => {
    if (ms == null) return "—";
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const progressRows = (Array.isArray(aggregate.events) ? aggregate.events : [])
    .filter((ev) => ev.eventType !== "GAME_CLOCK_STOPPED")
    .map((ev) => {
    const p = ev.payload as Record<string, unknown> | undefined;
    const side = (p?.side ?? p?.teamSide) as string | undefined;
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
        remark = "Quarter started";
        break;
      case "GAME_CLOCK_SET":
        remark = "Clock set";
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
    const isQuarterEnd = ev.eventType === "PERIOD_ADVANCED";
    const foulCount =
      ev.eventType === "EXCLUSION_STARTED" && side && cap
        ? (foulsByPlayer[(side as TeamSide)]?.[cap]?.length ?? 0)
        : undefined;
    return {
      id: ev.id,
      time: timeStr,
      cap,
      team,
      remark,
      score,
      isQuarterStart,
      isQuarterEnd,
      foulCount,
      editable: ev.eventType !== "GAME_CREATED",
    };
  });

  const openProgressEditForRow = (rowId: string) => {
    const full = [...(aggregate.events ?? [])];
    sortGameEventsAsc(full);
    setProgressEditEvents(full);
    setProgressEditSelectedId(rowId);
    setProgressEditError(null);
    setProgressInsertMode(null);
    setProgressEditOpen(true);
  };

  const applyInsertEntry = () => {
    if (!progressEditEvents || !progressEditSelectedId || !gameId || !progressInsertMode) return;
    let built: { eventType: string; payload: Record<string, unknown> };
    let ts: { timeSeconds?: number } = {};
    if (insertTimeSec.trim() !== "") {
      const parsed = parseOptionalGameClockTime(insertTimeSec);
      if (!parsed.ok) {
        setProgressEditError(parsed.error);
        return;
      }
      if (parsed.seconds !== undefined) ts = { timeSeconds: parsed.seconds };
    }
    try {
      if (insertKind === "GOAL") {
        const et = insertSide === "HOME" ? "GOAL_HOME" : "GOAL_AWAY";
        if (!insertCap.trim()) throw new Error("Cap # is required for a goal.");
        built = {
          eventType: et,
          payload: {
            side: insertSide,
            capNumber: insertCap.trim(),
            delta: 1,
            ...ts,
          },
        };
      } else if (insertKind === "EXCLUSION" || insertKind === "PENALTY") {
        const pl = aggregate.players.find(
          (p) => p.teamSide === insertSide && p.capNumber === insertCap.trim()
        );
        if (!pl) throw new Error("No roster player matches that team and cap.");
        built = {
          eventType: "EXCLUSION_STARTED",
          payload: {
            playerId: pl.id,
            teamSide: insertSide,
            capNumber: pl.capNumber,
            durationMs: 20000,
            isPenalty: insertKind === "PENALTY",
            ...ts,
          },
        };
      } else if (insertKind === "TIMEOUT") {
        built = {
          eventType: "TIMEOUT_USED",
          payload: { teamSide: insertSide, type: "full", ...ts },
        };
      } else {
        built = {
          eventType: "TIMEOUT_USED",
          payload: { teamSide: insertSide, type: "short", ...ts },
        };
      }
    } catch (e) {
      setProgressEditError(e instanceof Error ? e.message : String(e));
      return;
    }
    const anchorId = progressEditSelectedId;
    const idx = progressEditEvents.findIndex((e) => e.id === anchorId);
    if (idx === -1) return;
    const insertIdx = progressInsertMode === "before" ? idx : idx + 1;
    const prevEv = insertIdx > 0 ? progressEditEvents[insertIdx - 1] : null;
    const nextEv =
      insertIdx < progressEditEvents.length ? progressEditEvents[insertIdx] : null;
    let createdAt: string;
    if (prevEv && nextEv) {
      const ta = new Date(prevEv.createdAt).getTime();
      const tb = new Date(nextEv.createdAt).getTime();
      if (tb > ta) {
        createdAt = new Date(ta + Math.floor((tb - ta) / 2)).toISOString();
      } else {
        createdAt = new Date(ta + 1).toISOString();
      }
    } else if (prevEv) {
      createdAt = new Date(new Date(prevEv.createdAt).getTime() + 500).toISOString();
    } else if (nextEv) {
      createdAt = new Date(new Date(nextEv.createdAt).getTime() - 500).toISOString();
    } else {
      createdAt = new Date().toISOString();
    }
    const newRow: GameAggregate["events"][number] = {
      id: `__insert_${Date.now()}`,
      gameId,
      eventType: built.eventType,
      payload: built.payload,
      createdAt,
      source: "operator",
    };
    const copy = [...progressEditEvents];
    copy.splice(insertIdx, 0, newRow);
    setProgressEditEvents(copy);
    setProgressInsertMode(null);
    setProgressEditError(null);
  };

  const deleteProgressEntry = () => {
    if (!progressEditEvents || !progressEditSelectedId) return;
    const target = progressEditEvents.find((e) => e.id === progressEditSelectedId);
    if (target?.eventType === "GAME_CREATED") {
      setProgressEditError("Cannot delete the Game created row.");
      return;
    }
    const delIdx = progressEditEvents.findIndex((e) => e.id === progressEditSelectedId);
    const filtered = progressEditEvents.filter((e) => e.id !== progressEditSelectedId);
    if (filtered.length === 0 || filtered[0]?.eventType !== "GAME_CREATED") {
      setProgressEditError("Timeline must keep Game created as the first row.");
      return;
    }
    if (
      !confirm(
        "Delete this entry from the timeline? Click Update & rerun to save to the server."
      )
    ) {
      return;
    }
    const nextSel =
      filtered[Math.max(0, delIdx - 1)]?.id ?? filtered[0]?.id ?? null;
    setProgressEditEvents(filtered);
    setProgressEditSelectedId(nextSel);
  };

  const submitProgressRebuild = async () => {
    if (!gameId || !progressEditEvents?.length) return;
    let list = [...progressEditEvents];
    const sel = list.find((e) => e.id === progressEditSelectedId);
    if (sel) {
      if (sel.eventType === "GOAL_HOME" || sel.eventType === "GOAL_AWAY") {
        if (!gfCap.trim()) {
          setProgressEditError("Cap # is required for a goal.");
          return;
        }
        const newType = gfSide === "HOME" ? "GOAL_HOME" : "GOAL_AWAY";
        const prev = sel.payload as Record<string, unknown>;
        const gfParsed = parseOptionalGameClockTime(gfTime);
        if (!gfParsed.ok) {
          setProgressEditError(gfParsed.error);
          return;
        }
        list = list.map((e) =>
          e.id !== sel.id
            ? e
            : (() => {
                const nextPayload: Record<string, unknown> = {
                  ...prev,
                  side: gfSide,
                  capNumber: gfCap.trim(),
                  delta: typeof prev.delta === "number" ? prev.delta : 1,
                };
                if (gfParsed.seconds !== undefined) {
                  nextPayload.timeSeconds = gfParsed.seconds;
                } else {
                  delete nextPayload.timeSeconds;
                }
                return { ...e, eventType: newType, payload: nextPayload };
              })()
        );
      } else if (sel.eventType === "EXCLUSION_STARTED") {
        const prev = sel.payload as Record<string, unknown>;
        const exParsed = parseOptionalGameClockTime(exTime);
        if (!exParsed.ok) {
          setProgressEditError(exParsed.error);
          return;
        }
        list = list.map((e) =>
          e.id !== sel.id
            ? e
            : (() => {
                const nextPayload: Record<string, unknown> = {
                  ...prev,
                  isPenalty: exPenalty,
                };
                if (exParsed.seconds !== undefined) {
                  nextPayload.timeSeconds = exParsed.seconds;
                } else {
                  delete nextPayload.timeSeconds;
                }
                return { ...e, payload: nextPayload };
              })()
        );
      } else if (sel.eventType === "TIMEOUT_USED") {
        const prev = sel.payload as Record<string, unknown>;
        list = list.map((e) =>
          e.id !== sel.id
            ? e
            : {
                ...e,
                payload: {
                  ...prev,
                  teamSide: toSide,
                  type: toShort ? "short" : "full",
                },
              }
        );
      }
    }
    setProgressEditBusy(true);
    setProgressEditError(null);
    try {
      const next = await api.games.rebuildEventLog(gameId, {
        events: list.map((e) => ({
          id: e.id.startsWith("__insert_") ? undefined : e.id,
          eventType: e.eventType,
          payload: e.payload,
          createdAt: e.createdAt,
          source: e.source ?? "operator",
        })),
      });
      setAggregate(next);
      setProgressEditOpen(false);
      setProgressEditEvents(null);
      setProgressEditSelectedId(null);
    } catch (err) {
      setProgressEditError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgressEditBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) {
      setInputError("Enter a scoring command.");
      setLastParsed(null);
      return;
    }
    const parsed = parseScoreInput(trimmed);
    if (!parsed.ok) {
      setInputError(parsed.error);
      setLastParsed(null);
      return;
    }
    setInputError(null);
    setLastParsed(parsed.value);
    if (!gameId) return;
    if (isGameOver) return;

    const isEqInQ4 =
      parsed.value.type === "END_QUARTER" &&
      aggregate.currentPeriod === 4 &&
      aggregate.totalPeriods === 4;
    const homeScore = aggregate.score?.homeScore ?? 0;
    const awayScore = aggregate.score?.awayScore ?? 0;
    const isTied = homeScore === awayScore;

    if (isEqInQ4 && isTied) {
      setEqOvertimeModalOpen(true);
      return;
    }
    if (isEqInQ4 && !isTied) {
      pendingEditModalAfterEnd.current = true;
    }

    const payload = {
      type: parsed.value.type,
      ...(parsed.value.timeSeconds != null && { timeSeconds: parsed.value.timeSeconds }),
      ...(parsed.value.side != null && { side: parsed.value.side }),
      ...(parsed.value.capNumber != null && { capNumber: parsed.value.capNumber }),
    };
    try {
      let next: GameAggregate;
      const betweenQuarters = !aggregate.gameClock?.running;
      if (betweenQuarters && parsed.value.type !== "START_QUARTER") {
        await api.games.applyScoreCommand(gameId, { type: "START_QUARTER" });
        next = await api.games.applyScoreCommand(gameId, payload);
      } else {
        next = await api.games.applyScoreCommand(gameId, payload);
      }
      setAggregate(next);
      setInput("");
      if (pendingEditModalAfterEnd.current) {
        pendingEditModalAfterEnd.current = false;
        setEqEditEntriesModalOpen(true);
      }
    } catch (err) {
      setInputError(err instanceof Error ? err.message : String(err));
      if (pendingEditModalAfterEnd.current) pendingEditModalAfterEnd.current = false;
    }
  };

  const sheetTitlePrefix = [aggregate.level, aggregate.gender]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .join(" ");

  return (
    <div className="page game-sheet-page">
      <header className="page-header game-sheet-page-header">
        <div className="game-sheet-page-header-back">
          <Link to={gameDayId ? `/game-days/${gameDayId}` : "/"}>← Back to game day</Link>
          {gameDayId && gameId ? (
            <>
              {" · "}
              <Link to={`/game-days/${gameDayId}/games/${gameId}/scoreboard`}>Scoreboard only</Link>
            </>
          ) : null}
        </div>
        <div className="game-sheet-page-header-title">
          <h1>
            {sheetTitlePrefix ? `${sheetTitlePrefix}: ` : ""}
            {aggregate.homeTeamName} vs {aggregate.awayTeamName}
          </h1>
        </div>
      </header>

      <div className="game-sheet-main">
        {/* Column 1: scoreboard + input + game progress */}
        <div className="game-sheet-col">
          <section className="game-sheet-scoreboard">
            <div className="scoreboard-card">
              <div className="scoreboard-header">
                <div>
                  <div className="scoreboard-team-label">Home (dark)</div>
                  <div className="scoreboard-team-name">{aggregate.homeTeamName}</div>
                  <div className="scoreboard-caps">Caps: Dark</div>
                </div>
                <div>
                  <div className="scoreboard-team-label">Away (light)</div>
                  <div className="scoreboard-team-name">{aggregate.awayTeamName}</div>
                  <div className="scoreboard-caps">Caps: White</div>
                </div>
              </div>
              <div className="scoreboard-body">
                <div className="scoreboard-column">
                  <div>
                    <button
                      type="button"
                      className="scoreboard-score-link"
                      onClick={() => setScoreResultsModalOpen(true)}
                    >
                      Score: <span className="scoreboard-score">{homeScore}</span>
                    </button>
                  </div>
                  <div className="scoreboard-timeouts">
                    <button
                      type="button"
                      className="scoreboard-timeouts-link"
                      onClick={() => setTimeoutsModalOpen(true)}
                    >
                      Timeouts:
                    </button>
                    <div className="scoreboard-timeouts-value">
                      F: {homeTimeouts?.fullTimeoutsRemaining ?? 0}  30s: {homeTimeouts?.shortTimeoutsRemaining ?? 0}
                    </div>
                  </div>
                </div>
                <div className="scoreboard-column">
                  <div>
                    <button
                      type="button"
                      className="scoreboard-score-link"
                      onClick={() => setScoreResultsModalOpen(true)}
                    >
                      Score: <span className="scoreboard-score">{awayScore}</span>
                    </button>
                  </div>
                  <div className="scoreboard-timeouts">
                    <button
                      type="button"
                      className="scoreboard-timeouts-link"
                      onClick={() => setTimeoutsModalOpen(true)}
                    >
                      Timeouts:
                    </button>
                    <div className="scoreboard-timeouts-value">
                      F: {awayTimeouts?.fullTimeoutsRemaining ?? 0}  30s: {awayTimeouts?.shortTimeoutsRemaining ?? 0}
                    </div>
                  </div>
                </div>
              </div>
              <div className="scoreboard-footer">
                <div>Period: Q{aggregate.currentPeriod}</div>
                <div>Game clock: {aggregate.gameClock?.running ? formatMsToClock(aggregate.gameClock.remainingMs) : "—"}</div>
              </div>
            </div>
          </section>

          <section className="game-sheet-input">
            <form onSubmit={handleSubmit} className="form scoring-input-form">
              {inputError && <p className="error">{inputError}</p>}
              <div className="scoring-row">
                <label className="scoring-label">
                  <button
                    type="button"
                    className="scoring-command-link"
                    onClick={() => setCommandHelpOpen(true)}
                    disabled={isGameOver}
                  >
                    Scoring command
                  </button>
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="e.g. 6.07w13g"
                    disabled={isGameOver}
                    aria-label="Scoring command"
                  />
                </label>
                {isGameOver ? (
                  <button
                    type="button"
                    className="btn primary btn-compact scoring-apply"
                    onClick={async () => {
                      if (!gameId) return;
                      try {
                        const next = await api.games.update(gameId, {
                          status: "IN_PROGRESS",
                        });
                        setAggregate(next);
                        setInputError(null);
                      } catch (err) {
                        setInputError(err instanceof Error ? err.message : String(err));
                      }
                    }}
                  >
                    Reopen
                  </button>
                ) : (
                  <button type="submit" className="btn primary btn-compact scoring-apply">
                    Apply
                  </button>
                )}
              </div>
            </form>
            {lastParsed && (
              <p className="parsed-preview">
                Parsed: {describeParsed(lastParsed)}
              </p>
            )}
          </section>

          {commandHelpOpen && (
            <>
              <div
                className="scoring-command-help-overlay"
                role="presentation"
                onClick={() => setCommandHelpOpen(false)}
              />
              <aside
                className="scoring-command-help-panel"
                role="dialog"
                aria-label="Scoring command reference"
              >
                <div className="scoring-command-help-header">
                  <h2>Scoring command reference</h2>
                  <button
                    type="button"
                    className="scoring-command-help-close"
                    onClick={() => setCommandHelpOpen(false)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                <div className="scoring-command-help-body">
                  <h3>Quarter</h3>
                  <ul>
                    <li><strong>sq</strong> — Start quarter</li>
                    <li><strong>eq</strong> — End quarter</li>
                  </ul>

                  <h3>Time</h3>
                  <p>Use a dot or colon: <strong>6.07</strong> or <strong>6:07</strong> = 6 min 7 sec. Optional at the start of goal/exclusion/penalty.</p>

                  <h3>Team</h3>
                  <ul>
                    <li><strong>b</strong> or <strong>d</strong> — Dark (home)</li>
                    <li><strong>w</strong> or <strong>l</strong> — Light (away)</li>
                  </ul>

                  <h3>Goal / Exclusion / Penalty</h3>
                  <p>Either order works:</p>
                  <ul>
                    <li><strong>[time] team cap action</strong> — e.g. <code>6.07w13g</code> (Light cap 13 goal at 6:07)</li>
                    <li><strong>[time] action cap team</strong> — e.g. <code>6.07g13w</code></li>
                  </ul>
                  <p>Actions: <strong>g</strong> = goal, <strong>e</strong> = exclusion, <strong>p</strong> = penalty. Cap number is required.</p>

                  <h3>Timeout</h3>
                  <ul>
                    <li><strong>4.13tw</strong> or <strong>4.13tb</strong> — Full timeout at 4:13 for light (w) or dark (b)</li>
                    <li><strong>4.13t3w</strong> — 30-second timeout</li>
                  </ul>

                  <h3>Examples</h3>
                  <ul className="scoring-command-help-examples">
                    <li><code>sq</code> — start quarter</li>
                    <li><code>eq</code> — end quarter</li>
                    <li><code>6:50w13g</code> — Light cap 13 goal at 6:50</li>
                    <li><code>5.53b2e</code> — Dark cap 2 exclusion at 5:53</li>
                    <li><code>g13w</code> — Light cap 13 goal (no time)</li>
                    <li><code>4.13tw</code> — Light full timeout at 4:13</li>
                  </ul>
                </div>
              </aside>
            </>
          )}

          {eqOvertimeModalOpen && (
            <div className="game-sheet-modal-overlay" role="dialog" aria-labelledby="eq-overtime-title">
              <div className="game-sheet-modal">
                <h2 id="eq-overtime-title">Score is tied</h2>
                <p>Go to overtime?</p>
                <div className="game-sheet-modal-actions">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={async () => {
                      if (!gameId) return;
                      try {
                        const next = await api.games.applyScoreCommand(gameId, {
                          type: "END_QUARTER",
                          overtime: true,
                        });
                        setAggregate(next);
                        setInput("");
                        setEqOvertimeModalOpen(false);
                      } catch (err) {
                        setInputError(err instanceof Error ? err.message : String(err));
                      }
                    }}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setEqOvertimeModalOpen(false)}
                  >
                    No
                  </button>
                </div>
              </div>
            </div>
          )}

          {eqEditEntriesModalOpen && (
            <div className="game-sheet-modal-overlay" role="dialog" aria-labelledby="eq-edit-title">
              <div className="game-sheet-modal">
                <h2 id="eq-edit-title">Game over</h2>
                <p>Would you like to edit any entries?</p>
                <div className="game-sheet-modal-actions">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      setEqEditEntriesModalOpen(false);
                      if (gameDayId && gameId) {
                        navigate(`/game-days/${gameDayId}/games/${gameId}/edit`);
                      }
                    }}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setEqEditEntriesModalOpen(false)}
                  >
                    No
                  </button>
                </div>
              </div>
            </div>
          )}

          {progressEditOpen && progressEditEvents && progressEditSelectedId && (
            <div
              className="game-sheet-modal-overlay game-sheet-modal-overlay--progress-edit"
              role="dialog"
              aria-labelledby="progress-edit-title"
              onClick={() => {
                setProgressEditOpen(false);
                setProgressInsertMode(null);
              }}
            >
              <div
                className="game-sheet-modal game-sheet-progress-edit-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="game-sheet-timeouts-header">
                  <h2 id="progress-edit-title">Edit progress entry</h2>
                  <button
                    type="button"
                    className="scoring-command-help-close"
                    onClick={() => {
                      setProgressEditOpen(false);
                      setProgressInsertMode(null);
                    }}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                {(() => {
                  const sel =
                    progressEditEvents.find((e) => e.id === progressEditSelectedId) ??
                    null;
                  if (!sel) {
                    return (
                      <>
                        {progressEditError && (
                          <p className="error">{progressEditError}</p>
                        )}
                        <p>No row selected.</p>
                      </>
                    );
                  }
                  return (
                    <>
                      <div className="game-sheet-progress-edit-scroll">
                        {progressEditError && (
                          <p className="error">{progressEditError}</p>
                        )}
                        <p className="game-sheet-progress-edit-meta">
                        <strong>{sel.eventType.replace(/_/g, " ")}</strong>
                        {" · "}
                        {new Date(sel.createdAt).toLocaleString()}
                      </p>

                      {(sel.eventType === "GOAL_HOME" ||
                        sel.eventType === "GOAL_AWAY") && (
                        <div className="form game-sheet-progress-edit-fields">
                          <label>
                            Team
                            <select
                              value={gfSide}
                              onChange={(e) =>
                                setGfSide(e.target.value as TeamSide)
                              }
                            >
                              <option value="HOME">Dark (home)</option>
                              <option value="AWAY">Light (away)</option>
                            </select>
                          </label>
                          <label>
                            Cap #
                            <input
                              value={gfCap}
                              onChange={(e) => setGfCap(e.target.value)}
                            />
                          </label>
                          <label className="game-sheet-progress-field-span">
                            Game clock in period (optional, same as scoring: 6.50 or 6:50)
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="e.g. 6.50 or 6:07"
                              value={gfTime}
                              onChange={(e) => setGfTime(e.target.value)}
                            />
                          </label>
                          {(() => {
                            const prev = buildGoalCommandPreview(gfSide, gfCap, gfTime);
                            return (
                              <ScoringCommandPreviewBlock
                                command={prev.command}
                                note={prev.note}
                              />
                            );
                          })()}
                        </div>
                      )}

                      {sel.eventType === "EXCLUSION_STARTED" && (
                        <div className="form game-sheet-progress-edit-fields">
                          <p className="game-sheet-progress-hint">
                            Team and cap are tied to the stored player. To change them,
                            delete this row and insert a new exclusion.
                          </p>
                          <label className="game-sheet-progress-checkbox">
                            <input
                              type="checkbox"
                              checked={exPenalty}
                              onChange={(e) => setExPenalty(e.target.checked)}
                            />
                            Penalty (vs exclusion)
                          </label>
                          <label className="game-sheet-progress-field-span">
                            Game clock in period (optional, same as scoring: 6.50 or 6:50)
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="e.g. 6.50 or 6:07"
                              value={exTime}
                              onChange={(e) => setExTime(e.target.value)}
                            />
                          </label>
                          {(() => {
                            const pl = sel.payload as Record<string, unknown>;
                            const rawSide = pl.teamSide ?? pl.side;
                            const teamSide: TeamSide =
                              rawSide === "HOME" || rawSide === "AWAY"
                                ? rawSide
                                : "HOME";
                            const prev = buildExclusionCommandPreview(
                              teamSide,
                              String(pl.capNumber ?? ""),
                              exTime,
                              exPenalty
                            );
                            return (
                              <ScoringCommandPreviewBlock
                                command={prev.command}
                                note={prev.note}
                              />
                            );
                          })()}
                        </div>
                      )}

                      {sel.eventType === "TIMEOUT_USED" && (
                        <div className="form game-sheet-progress-edit-fields">
                          <label>
                            Team
                            <select
                              value={toSide}
                              onChange={(e) =>
                                setToSide(e.target.value as TeamSide)
                              }
                            >
                              <option value="HOME">Dark</option>
                              <option value="AWAY">Light</option>
                            </select>
                          </label>
                          <label className="game-sheet-progress-checkbox">
                            <input
                              type="checkbox"
                              checked={toShort}
                              onChange={(e) => setToShort(e.target.checked)}
                            />
                            30-second timeout
                          </label>
                          {(() => {
                            const pl = sel.payload as Record<string, unknown>;
                            const ts =
                              typeof pl.timeSeconds === "number"
                                ? pl.timeSeconds
                                : undefined;
                            const prev = buildTimeoutCommandPreview(
                              toSide,
                              toShort,
                              ts
                            );
                            return (
                              <ScoringCommandPreviewBlock
                                command={prev.command}
                                note={prev.note}
                              />
                            );
                          })()}
                        </div>
                      )}

                      {![
                        "GOAL_HOME",
                        "GOAL_AWAY",
                        "EXCLUSION_STARTED",
                        "TIMEOUT_USED",
                      ].includes(sel.eventType) && (
                        <p className="game-sheet-progress-readonly">
                          No field editor for this entry type. You can delete it or insert a
                          goal, exclusion, penalty, or timeout before/after. Quarter and clock
                          rows should stay consistent with the rest of the log.
                        </p>
                      )}

                      <div className="game-sheet-progress-insert-toolbar">
                        <button
                          type="button"
                          className="btn secondary btn-compact"
                          onClick={() => setProgressInsertMode("before")}
                          disabled={!!progressInsertMode}
                        >
                          Insert before
                        </button>
                        <button
                          type="button"
                          className="btn secondary btn-compact"
                          onClick={() => setProgressInsertMode("after")}
                          disabled={!!progressInsertMode}
                        >
                          Insert after
                        </button>
                      </div>

                      {progressInsertMode && (
                        <div className="game-sheet-progress-insert-panel">
                          <h3>
                            New entry (
                            {progressInsertMode === "before" ? "before" : "after"}{" "}
                            selected row)
                          </h3>
                          <p className="game-sheet-progress-hint">
                            Adds one log row. Quarter starts, clock stops, etc. still use the
                            scoring command field. Click <strong>Add to timeline</strong> when
                            ready—<strong>Update &amp; rerun</strong> stays off until then so you
                            don&apos;t save without the new row.
                          </p>
                          <div className="form game-sheet-progress-edit-fields">
                            <label>
                              Type
                              <select
                                value={insertKind}
                                onChange={(e) =>
                                  setInsertKind(
                                    e.target.value as
                                      | "GOAL"
                                      | "EXCLUSION"
                                      | "PENALTY"
                                      | "TIMEOUT"
                                      | "TIMEOUT_30"
                                  )
                                }
                              >
                                <option value="GOAL">Goal</option>
                                <option value="EXCLUSION">Exclusion</option>
                                <option value="PENALTY">Penalty</option>
                                <option value="TIMEOUT">Timeout (full)</option>
                                <option value="TIMEOUT_30">Timeout (30s)</option>
                              </select>
                            </label>
                            {(insertKind === "GOAL" ||
                              insertKind === "EXCLUSION" ||
                              insertKind === "PENALTY" ||
                              insertKind === "TIMEOUT" ||
                              insertKind === "TIMEOUT_30") && (
                              <label>
                                Team
                                <select
                                  value={insertSide}
                                  onChange={(e) =>
                                    setInsertSide(e.target.value as TeamSide)
                                  }
                                >
                                  <option value="HOME">Dark</option>
                                  <option value="AWAY">Light</option>
                                </select>
                              </label>
                            )}
                            {(insertKind === "GOAL" ||
                              insertKind === "EXCLUSION" ||
                              insertKind === "PENALTY") && (
                              <label>
                                Cap #
                                <input
                                  value={insertCap}
                                  onChange={(e) => setInsertCap(e.target.value)}
                                />
                              </label>
                            )}
                            <label className="game-sheet-progress-field-span">
                              Game clock in period (optional, same as scoring: 6.50 or 6:50)
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="e.g. 6.50 or 6:07"
                                value={insertTimeSec}
                                onChange={(e) => setInsertTimeSec(e.target.value)}
                              />
                            </label>
                            {(() => {
                              const prev = buildInsertCommandPreview(
                                insertKind,
                                insertSide,
                                insertCap,
                                insertTimeSec
                              );
                              return (
                                <ScoringCommandPreviewBlock
                                  command={prev.command}
                                  note={prev.note}
                                />
                              );
                            })()}
                          </div>
                          <div className="game-sheet-modal-actions">
                            <button
                              type="button"
                              className="btn"
                              onClick={() => setProgressInsertMode(null)}
                            >
                              Cancel insert
                            </button>
                            <button
                              type="button"
                              className="btn primary"
                              onClick={applyInsertEntry}
                            >
                              Add to timeline
                            </button>
                          </div>
                        </div>
                      )}
                      </div>

                      <div className="game-sheet-progress-edit-sticky-footer">
                        <div className="game-sheet-modal-actions game-sheet-progress-edit-footer">
                          <button
                            type="button"
                            className="btn"
                            onClick={deleteProgressEntry}
                            disabled={sel.eventType === "GAME_CREATED"}
                          >
                            Delete entry
                          </button>
                          <span style={{ flex: 1 }} />
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              setProgressEditOpen(false);
                              setProgressInsertMode(null);
                            }}
                          >
                            Close
                          </button>
                          <button
                            type="button"
                            className="btn primary game-sheet-progress-update-btn"
                            onClick={() => void submitProgressRebuild()}
                            disabled={
                              progressEditBusy || progressInsertMode != null
                            }
                            title={
                              progressInsertMode
                                ? "Click Add to timeline first, then this button saves to the server."
                                : undefined
                            }
                          >
                            {progressEditBusy
                              ? "Working…"
                              : progressInsertMode
                                ? "Add to timeline first…"
                                : "Update & rerun"}
                          </button>
                        </div>
                        <p className="game-sheet-progress-rerun-note">
                          {progressInsertMode
                            ? "Add to timeline adds the row to this dialog only. Then Update & rerun sends the full timeline to the server."
                            : "Sends the full event timeline to the server and recomputes score, timeouts, fouls, and clocks."}
                        </p>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {timeoutsModalOpen && (
            <div
              className="game-sheet-modal-overlay"
              role="dialog"
              aria-labelledby="timeouts-modal-title"
              onClick={() => setTimeoutsModalOpen(false)}
            >
              <div
                className="game-sheet-modal game-sheet-timeouts-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="game-sheet-timeouts-header">
                  <h2 id="timeouts-modal-title">Timeout details</h2>
                  <button
                    type="button"
                    className="scoring-command-help-close"
                    onClick={() => setTimeoutsModalOpen(false)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                <div className="game-sheet-timeouts-table-wrap">
                  <table className="table game-sheet-timeouts-table">
                    <thead>
                      <tr>
                        <th>Team</th>
                        <th>T1</th>
                        <th>T2</th>
                        <th>T3</th>
                        <th>T4</th>
                        <th>30TO</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>DARK</strong></td>
                        <td>{timeoutCalls.HOME.full[0] ?? "—"}</td>
                        <td>{timeoutCalls.HOME.full[1] ?? "—"}</td>
                        <td>{timeoutCalls.HOME.full[2] ?? "—"}</td>
                        <td>{timeoutCalls.HOME.full[3] ?? "—"}</td>
                        <td>{timeoutCalls.HOME.short[0] ?? "—"}</td>
                      </tr>
                      <tr>
                        <td><strong>WHITE</strong></td>
                        <td>{timeoutCalls.AWAY.full[0] ?? "—"}</td>
                        <td>{timeoutCalls.AWAY.full[1] ?? "—"}</td>
                        <td>{timeoutCalls.AWAY.full[2] ?? "—"}</td>
                        <td>{timeoutCalls.AWAY.full[3] ?? "—"}</td>
                        <td>{timeoutCalls.AWAY.short[0] ?? "—"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="game-sheet-timeouts-note">Format: game time / quarter</p>
              </div>
            </div>
          )}

          {scoreResultsModalOpen && (
            <div
              className="game-sheet-modal-overlay"
              role="dialog"
              aria-labelledby="score-results-title"
              onClick={() => setScoreResultsModalOpen(false)}
            >
              <div
                className="game-sheet-modal game-sheet-results-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="game-sheet-timeouts-header">
                  <h2 id="score-results-title">RESULTS</h2>
                  <button
                    type="button"
                    className="scoring-command-help-close"
                    onClick={() => setScoreResultsModalOpen(false)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                <div className="game-sheet-timeouts-table-wrap">
                  <table className="table game-sheet-results-table">
                    <thead>
                      <tr>
                        <th>QTR</th>
                        <th>D</th>
                        <th>W</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td>1</td><td>{scoreByQuarter.q1.home}</td><td>{scoreByQuarter.q1.away}</td></tr>
                      <tr><td>2</td><td>{scoreByQuarter.q2.home}</td><td>{scoreByQuarter.q2.away}</td></tr>
                      <tr><td>3</td><td>{scoreByQuarter.q3.home}</td><td>{scoreByQuarter.q3.away}</td></tr>
                      <tr><td>4</td><td>{scoreByQuarter.q4.home}</td><td>{scoreByQuarter.q4.away}</td></tr>
                      <tr className="results-row-divider"><td>OT</td><td>{scoreByQuarter.ot.home}</td><td>{scoreByQuarter.ot.away}</td></tr>
                      <tr><td>SD</td><td>---</td><td>---</td></tr>
                      <tr className="results-row-final"><td>FINAL</td><td>{scoreByQuarter.final.home}</td><td>{scoreByQuarter.final.away}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <section className="game-sheet-progress">
            <h3>Game progress</h3>
            <div className="game-sheet-progress-table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Cap#</th>
                    <th>Team</th>
                    <th>Remark</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {progressRows.length === 0 ? (
                    <tr>
                      <td colSpan={5}>No events yet.</td>
                    </tr>
                  ) : (
                    progressRows.map((row) => (
                      <tr
                        key={row.id}
                        className={[
                          row.isQuarterStart && "game-progress-row--quarter-start",
                          row.isQuarterEnd && "game-progress-row--quarter-end",
                          row.foulCount === 2 && "game-progress-row--fouls-2",
                          row.foulCount === 3 && "game-progress-row--fouls-3",
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined}
                      >
                        <td>{row.time}</td>
                        <td>{row.cap}</td>
                        <td>{row.team}</td>
                        <td>
                          {row.editable ? (
                            <button
                              type="button"
                              className="scoreboard-timeouts-link"
                              onClick={() => openProgressEditForRow(row.id)}
                            >
                              {row.remark}
                            </button>
                          ) : (
                            row.remark
                          )}
                        </td>
                        <td>{row.score}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Column 2: home roster + goals + fouls */}
        <div className="game-sheet-col">
          <section className="game-sheet-roster-column game-sheet-roster-column-home">
            <div className="game-sheet-roster-card">
            <h3>Home - {aggregate.homeTeamName} (dark)</h3>
            <table className="table game-sheet-roster-table">
              <thead>
                <tr>
                  <th>Cap#</th>
                  <th>Name</th>
                  <th>Q1</th>
                  <th>Q2</th>
                  <th>Q3</th>
                  <th>Q4</th>
                  <th>OT</th>
                  <th>TOT</th>
                </tr>
              </thead>
              <tbody>
                {maxRosterRows === 0 ? (
                  <tr>
                    <td colSpan={8}>No roster yet.</td>
                  </tr>
                ) : (
                  <>
                    {Array.from({ length: maxRosterRows }, (_, index) => {
                      const p = homePlayers[index];
                      if (!p) {
                        return (
                          <tr key={`home-empty-${index}`}>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                          </tr>
                        );
                      }
                      const g = getGoalsForPlayer("HOME", p.capNumber);
                      const isEjected = (foulsByPlayer.HOME?.[p.capNumber]?.length ?? 0) === 3;
                      return (
                        <tr key={p.id} className={isEjected ? "roster-row--ejected" : undefined}>
                          <td>{p.capNumber}</td>
                          <td>{p.playerName}</td>
                          <td>{g.q1}</td>
                          <td>{g.q2}</td>
                          <td>{g.q3}</td>
                          <td>{g.q4}</td>
                          <td>{g.ot}</td>
                          <td>{g.tot}</td>
                        </tr>
                      );
                    })}
                    <tr className="roster-totals-row">
                      <td colSpan={2}>Totals</td>
                      <td>{homeRosterTotals.q1}</td>
                      <td>{homeRosterTotals.q2}</td>
                      <td>{homeRosterTotals.q3}</td>
                      <td>{homeRosterTotals.q4}</td>
                      <td>{homeRosterTotals.ot}</td>
                      <td>{homeRosterTotals.tot}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>

            <h4 className="game-sheet-fouls-heading">Personal fouls (3 per player)</h4>
            <table className="table game-sheet-fouls-table">
              <thead>
                <tr>
                  <th>Cap#</th>
                  <th>Name</th>
                  <th>1</th>
                  <th>2</th>
                  <th>3</th>
                </tr>
              </thead>
              <tbody>
                {maxRosterRows === 0 ? (
                  <tr>
                    <td colSpan={5}>No roster yet.</td>
                  </tr>
                ) : (
                  Array.from({ length: maxRosterRows }, (_, index) => {
                    const p = homePlayers[index];
                    if (!p) {
                      return (
                        <tr key={`home-foul-empty-${index}`}>
                          <td>&nbsp;</td>
                          <td>&nbsp;</td>
                          <td className="foul-slot">&nbsp;</td>
                          <td className="foul-slot">&nbsp;</td>
                          <td className="foul-slot">&nbsp;</td>
                        </tr>
                      );
                    }
                    const [s1, s2, s3] = getFoulSlots("HOME", p.capNumber);
                    const foulCount = [s1, s2, s3].filter((s) => s !== "—").length;
                    return (
                      <tr
                        key={`foul-${p.id}`}
                        className={[
                          foulCount === 2 && "fouls-row--2",
                          foulCount === 3 && "fouls-row--3",
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined}
                      >
                        <td>{p.capNumber}</td>
                        <td>{p.playerName}</td>
                        <td className="foul-slot">{s1}</td>
                        <td className="foul-slot">{s2}</td>
                        <td className="foul-slot">{s3}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            </div>
          </section>
        </div>

        {/* Column 3: away roster + goals + fouls */}
        <div className="game-sheet-col">
          <section className="game-sheet-roster-column game-sheet-roster-column-away">
            <div className="game-sheet-roster-card">
            <h3>Away - {aggregate.awayTeamName} (light)</h3>
            <table className="table game-sheet-roster-table">
              <thead>
                <tr>
                  <th>Cap#</th>
                  <th>Name</th>
                  <th>Q1</th>
                  <th>Q2</th>
                  <th>Q3</th>
                  <th>Q4</th>
                  <th>OT</th>
                  <th>TOT</th>
                </tr>
              </thead>
              <tbody>
                {maxRosterRows === 0 ? (
                  <tr>
                    <td colSpan={8}>No roster yet.</td>
                  </tr>
                ) : (
                  <>
                    {Array.from({ length: maxRosterRows }, (_, index) => {
                      const p = awayPlayers[index];
                      if (!p) {
                        return (
                          <tr key={`away-empty-${index}`}>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                          </tr>
                        );
                      }
                      const g = getGoalsForPlayer("AWAY", p.capNumber);
                      const isEjected = (foulsByPlayer.AWAY?.[p.capNumber]?.length ?? 0) === 3;
                      return (
                        <tr key={p.id} className={isEjected ? "roster-row--ejected" : undefined}>
                          <td>{p.capNumber}</td>
                          <td>{p.playerName}</td>
                          <td>{g.q1}</td>
                          <td>{g.q2}</td>
                          <td>{g.q3}</td>
                          <td>{g.q4}</td>
                          <td>{g.ot}</td>
                          <td>{g.tot}</td>
                        </tr>
                      );
                    })}
                    <tr className="roster-totals-row">
                      <td colSpan={2}>Totals</td>
                      <td>{awayRosterTotals.q1}</td>
                      <td>{awayRosterTotals.q2}</td>
                      <td>{awayRosterTotals.q3}</td>
                      <td>{awayRosterTotals.q4}</td>
                      <td>{awayRosterTotals.ot}</td>
                      <td>{awayRosterTotals.tot}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>

            <h4 className="game-sheet-fouls-heading">Personal fouls (3 per player)</h4>
            <table className="table game-sheet-fouls-table">
              <thead>
                <tr>
                  <th>Cap#</th>
                  <th>Name</th>
                  <th>1</th>
                  <th>2</th>
                  <th>3</th>
                </tr>
              </thead>
              <tbody>
                {maxRosterRows === 0 ? (
                  <tr>
                    <td colSpan={5}>No roster yet.</td>
                  </tr>
                ) : (
                  Array.from({ length: maxRosterRows }, (_, index) => {
                    const p = awayPlayers[index];
                    if (!p) {
                      return (
                        <tr key={`away-foul-empty-${index}`}>
                          <td>&nbsp;</td>
                          <td>&nbsp;</td>
                          <td className="foul-slot">&nbsp;</td>
                          <td className="foul-slot">&nbsp;</td>
                          <td className="foul-slot">&nbsp;</td>
                        </tr>
                      );
                    }
                    const [s1, s2, s3] = getFoulSlots("AWAY", p.capNumber);
                    const foulCount = [s1, s2, s3].filter((s) => s !== "—").length;
                    return (
                      <tr
                        key={`foul-${p.id}`}
                        className={[
                          foulCount === 2 && "fouls-row--2",
                          foulCount === 3 && "fouls-row--3",
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined}
                      >
                        <td>{p.capNumber}</td>
                        <td>{p.playerName}</td>
                        <td className="foul-slot">{s1}</td>
                        <td className="foul-slot">{s2}</td>
                        <td className="foul-slot">{s3}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function parseScoreInput(raw: string): { ok: true; value: ParsedInput } | { ok: false; error: string } {
  // Allow colon as time separator; normalize to dot for parsing
  const normalized = raw.replace(/:/g, ".");
  const lower = normalized.toLowerCase();

  if (lower === "sq") {
    return { ok: true, value: { raw, type: "START_QUARTER" } };
  }
  if (lower === "eq") {
    return { ok: true, value: { raw, type: "END_QUARTER" } };
  }

  // b and d both mean dark; w and l both mean light
  const darkChars = "bd";

  // Timeout with time and side: 4.13tw or 4.13tb (t or t3 before side)
  const timeoutPattern = /^(\d+(\.\d{1,2})?)(t3?|t)([bdwl])$/;
  const timeoutMatch = lower.match(timeoutPattern);
  if (timeoutMatch) {
    const timeSeconds = parseTimeToSeconds(timeoutMatch[1]);
    const action = timeoutMatch[3];
    const sideChar = timeoutMatch[4];
    const side: TeamSide = darkChars.includes(sideChar) ? "HOME" : "AWAY";
    const type = action === "t3" ? "TIMEOUT_30" : "TIMEOUT";
    return { ok: true, value: { raw, type, timeSeconds, side } };
  }

  // Goal/exclusion/penalty: [time] then either (team)(cap)(action) or (action)(cap)(team)
  const timePartRe = /^(\d*(\.\d{1,2})?)?/;
  const timePartMatch = lower.match(timePartRe);
  const timePart = timePartMatch ? timePartMatch[1] : undefined;
  const rest = timePart != null ? lower.slice(timePart.length) : lower;

  // Standard order: team then cap then action — (b|d|w|l)(\d+)(g|e|p)
  const standardRe = /^([bdwl])(\d+)([gep])$/;
  // Swapped order: action then cap then team — (g|e|p)(\d+)(b|d|w|l)
  const swappedRe = /^([gep])(\d+)([bdwl])$/;

  let sideChar: string;
  let capPart: string;
  let action: string;

  const standardMatch = rest.match(standardRe);
  if (standardMatch) {
    sideChar = standardMatch[1];
    capPart = standardMatch[2];
    action = standardMatch[3];
  } else {
    const swappedMatch = rest.match(swappedRe);
    if (swappedMatch) {
      action = swappedMatch[1];
      capPart = swappedMatch[2];
      sideChar = swappedMatch[3];
    } else {
      return {
        ok: false,
        error:
          "Invalid command. Examples: sq, eq, 6.07w13g, 5.53b2e, 6:07d3g, g13w, 4.13tw or 4.13t3w.",
      };
    }
  }

  const timeSeconds =
    timePart != null && timePart.length > 0 ? parseTimeToSeconds(timePart) : undefined;
  const side: TeamSide = darkChars.includes(sideChar) ? "HOME" : "AWAY";

  let type: ParsedInput["type"];
  if (action === "g") type = "GOAL";
  else if (action === "e") type = "EXCLUSION";
  else if (action === "p") type = "PENALTY";
  else type = "TIMEOUT";

  return {
    ok: true,
    value: {
      raw,
      type,
      timeSeconds,
      side,
      capNumber: capPart,
    },
  };
}

function parseTimeToSeconds(time: string): number {
  // formats: "6.07", "6:07", ".03", "6" — normalize colon to dot
  const t = time.replace(":", ".");
  if (!t) return 0;
  if (t.startsWith(".")) {
    const seconds = Number(t.slice(1));
    return isNaN(seconds) ? 0 : seconds;
  }
  if (!t.includes(".")) {
    const minutes = Number(t);
    return isNaN(minutes) ? 0 : minutes * 60;
  }
  const [mStr, sStr] = t.split(".");
  const minutes = Number(mStr || "0");
  const seconds = Number(sStr || "0");
  if (isNaN(minutes) || isNaN(seconds)) return 0;
  return minutes * 60 + seconds;
}

function formatGameClockTimeForInput(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0 && s > 0) return `.${s.toString().padStart(2, "0")}`;
  if (m === 0 && s === 0) return "0";
  return `${m}.${s.toString().padStart(2, "0")}`;
}

function parseOptionalGameClockTime(
  raw: string
):
  | { ok: true; seconds: number | undefined }
  | { ok: false; error: string } {
  const t = raw.trim().replace(/:/g, ".");
  if (t === "") return { ok: true, seconds: undefined };
  if (!/^(\d+\.\d{1,2}|\d+|\.\d{1,2})$/.test(t)) {
    return {
      ok: false,
      error:
        "Invalid game clock. Use scoring time: minutes.seconds (e.g. 6.50 or 6:50), minutes only (6), or seconds only (.03).",
    };
  }
  return { ok: true, seconds: parseTimeToSeconds(t) };
}

function teamSideToScoringChar(side: TeamSide): "b" | "w" {
  return side === "HOME" ? "b" : "w";
}

/** Time prefix for scoring-command preview; empty if field blank or invalid while typing. */
function clockPrefixForPreview(raw: string): string {
  if (raw.trim() === "") return "";
  const parsed = parseOptionalGameClockTime(raw);
  if (!parsed.ok || parsed.seconds === undefined) return "";
  return formatGameClockTimeForInput(parsed.seconds);
}

type ScoringCommandPreviewResult = {
  command: string;
  note?: string;
};

function buildGoalCommandPreview(
  side: TeamSide,
  cap: string,
  timeRaw: string
): ScoringCommandPreviewResult {
  const prefix = clockPrefixForPreview(timeRaw);
  const capPart = cap.trim() || "?";
  const command = `${prefix}${teamSideToScoringChar(side)}${capPart}g`;
  const invalidClock = timeRaw.trim() !== "" && prefix === "";
  return {
    command,
    note: invalidClock
      ? "Enter a valid game clock to include time in the preview."
      : undefined,
  };
}

function buildExclusionCommandPreview(
  teamSide: TeamSide,
  cap: string,
  timeRaw: string,
  isPenalty: boolean
): ScoringCommandPreviewResult {
  const prefix = clockPrefixForPreview(timeRaw);
  const capPart = cap.trim() || "?";
  const action = isPenalty ? "p" : "e";
  const command = `${prefix}${teamSideToScoringChar(teamSide)}${capPart}${action}`;
  const invalidClock = timeRaw.trim() !== "" && prefix === "";
  return {
    command,
    note: invalidClock
      ? "Enter a valid game clock to include time in the preview."
      : undefined,
  };
}

function buildTimeoutCommandPreview(
  side: TeamSide,
  isShort: boolean,
  timeSeconds: number | undefined
): ScoringCommandPreviewResult {
  const c = teamSideToScoringChar(side);
  const mid = isShort ? "t3" : "t";
  if (typeof timeSeconds === "number" && Number.isFinite(timeSeconds)) {
    return {
      command: `${formatGameClockTimeForInput(timeSeconds)}${mid}${c}`,
    };
  }
  return {
    command: `${mid}${c}`,
    note: isShort
      ? "Main scoring entry normally includes the clock (e.g. 4.13t3w)."
      : "Main scoring entry normally includes the clock (e.g. 4.13tw).",
  };
}

function buildInsertCommandPreview(
  kind: "GOAL" | "EXCLUSION" | "PENALTY" | "TIMEOUT" | "TIMEOUT_30",
  side: TeamSide,
  cap: string,
  timeRaw: string
): ScoringCommandPreviewResult {
  const prefix = clockPrefixForPreview(timeRaw);
  const invalidClock = timeRaw.trim() !== "" && prefix === "";
  const clockNote = invalidClock
    ? "Enter a valid game clock to include time in the preview."
    : undefined;
  const c = teamSideToScoringChar(side);

  if (kind === "GOAL") {
    const capPart = cap.trim() || "?";
    return { command: `${prefix}${c}${capPart}g`, note: clockNote };
  }
  if (kind === "EXCLUSION") {
    const capPart = cap.trim() || "?";
    return { command: `${prefix}${c}${capPart}e`, note: clockNote };
  }
  if (kind === "PENALTY") {
    const capPart = cap.trim() || "?";
    return { command: `${prefix}${c}${capPart}p`, note: clockNote };
  }
  if (kind === "TIMEOUT_30") {
    if (prefix !== "") return { command: `${prefix}t3${c}`, note: clockNote };
    return {
      command: `t3${c}`,
      note: clockNote ?? "Main scoring entry normally includes the clock (e.g. 4.13t3w).",
    };
  }
  if (prefix !== "") return { command: `${prefix}t${c}`, note: clockNote };
  return {
    command: `t${c}`,
    note: clockNote ?? "Main scoring entry normally includes the clock (e.g. 4.13tw).",
  };
}

function ScoringCommandPreviewBlock({
  command,
  note,
}: ScoringCommandPreviewResult) {
  return (
    <p className="game-sheet-progress-command-preview">
      <span className="game-sheet-progress-command-preview-label">
        Scoring command (main entry syntax)
      </span>
      <code className="game-sheet-progress-command-preview-code">{command}</code>
      {note ? (
        <span className="game-sheet-progress-command-preview-note">{note}</span>
      ) : null}
    </p>
  );
}

function describeParsed(parsed: ParsedInput): string {
  switch (parsed.type) {
    case "START_QUARTER":
      return "Start quarter";
    case "END_QUARTER":
      return "End quarter";
    case "TIMEOUT":
      return `${parsed.side === "HOME" ? "Dark" : "Light"} timeout at ${formatSeconds(parsed.timeSeconds)}`;
    case "TIMEOUT_30":
      return `${parsed.side === "HOME" ? "Dark" : "Light"} 30s timeout at ${formatSeconds(parsed.timeSeconds)}`;
    case "GOAL":
      return `${parsed.side === "HOME" ? "Dark" : "Light"} cap ${parsed.capNumber} goal at ${formatSeconds(parsed.timeSeconds)}`;
    case "EXCLUSION":
      return `${parsed.side === "HOME" ? "Dark" : "Light"} cap ${parsed.capNumber} exclusion at ${formatSeconds(parsed.timeSeconds)}`;
    case "PENALTY":
      return `${parsed.side === "HOME" ? "Dark" : "Light"} cap ${parsed.capNumber} penalty at ${formatSeconds(parsed.timeSeconds)}`;
    default:
      return parsed.raw;
  }
}

function formatSeconds(seconds?: number): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

