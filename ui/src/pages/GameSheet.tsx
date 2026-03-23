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
  const [eqOvertimeModalOpen, setEqOvertimeModalOpen] = useState(false);
  const [eqEditEntriesModalOpen, setEqEditEntriesModalOpen] = useState(false);
  const pendingEditModalAfterEnd = useRef(false);
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
    events.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
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
        if (!goals.HOME[cap]) goals.HOME[cap] = {};
        goals.HOME[cap][currentPeriod] = (goals.HOME[cap][currentPeriod] ?? 0) + 1;
      }
      if (ev.eventType === "GOAL_AWAY" && p?.capNumber) {
        const cap = String(p.capNumber);
        if (!goals.AWAY[cap]) goals.AWAY[cap] = {};
        goals.AWAY[cap][currentPeriod] = (goals.AWAY[cap][currentPeriod] ?? 0) + 1;
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
    eventList.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
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
    events.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
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
    };
  });

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

  return (
    <div className="page game-sheet-page">
      <header className="page-header">
        <Link to={gameDayId ? `/game-days/${gameDayId}` : "/"}>← Back to game day</Link>
        <h1>{aggregate.awayTeamName} vs {aggregate.homeTeamName}</h1>
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
                  <div>Score: <span className="scoreboard-score">{homeScore}</span></div>
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
                  <div>Score: <span className="scoreboard-score">{awayScore}</span></div>
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
                        <td>{row.remark}</td>
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
                  Array.from({ length: maxRosterRows }, (_, index) => {
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
                  })
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
                  Array.from({ length: maxRosterRows }, (_, index) => {
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
                  })
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

