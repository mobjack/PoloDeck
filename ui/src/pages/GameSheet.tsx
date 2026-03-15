import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import { api, type GameAggregate } from "../api/client";
import type { GameDay } from "../types/gameDay";

type TeamSide = "HOME" | "AWAY";

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
  const [error, setError] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [lastParsed, setLastParsed] = useState<ParsedInput | null>(null);

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
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
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

  if (loading) return <div className="page"><p>Loading…</p></div>;
  if (error) return <div className="page"><p className="error">Error: {error}</p></div>;
  if (!gameDay || !aggregate) return <div className="page"><p>Game not found.</p></div>;

  const homeScore = aggregate.score?.homeScore ?? 0;
  const awayScore = aggregate.score?.awayScore ?? 0;
  const homeTimeouts = aggregate.timeoutStates?.find((t) => t.teamSide === "HOME");
  const awayTimeouts = aggregate.timeoutStates?.find((t) => t.teamSide === "AWAY");

  const homePlayers = (aggregate.players ?? [])
    .filter((p) => p.teamSide === "HOME" && p.playerName.trim().length > 0)
    .sort((a, b) => a.capNumber.localeCompare(b.capNumber));
  const awayPlayers = (aggregate.players ?? [])
    .filter((p) => p.teamSide === "AWAY" && p.playerName.trim().length > 0)
    .sort((a, b) => a.capNumber.localeCompare(b.capNumber));

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
    } catch (err) {
      setInputError(err instanceof Error ? err.message : String(err));
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
                  <div>
                    Timeouts: F: {homeTimeouts?.fullTimeoutsRemaining ?? 0}  30s:{" "}
                    {homeTimeouts?.shortTimeoutsRemaining ?? 0}
                  </div>
                </div>
                <div className="scoreboard-column">
                  <div>Score: <span className="scoreboard-score">{awayScore}</span></div>
                  <div>
                    Timeouts: F: {awayTimeouts?.fullTimeoutsRemaining ?? 0}  30s:{" "}
                    {awayTimeouts?.shortTimeoutsRemaining ?? 0}
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
                  Scoring command
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="e.g. 6.07w13g"
                  />
                </label>
                <button type="submit" className="btn primary btn-compact scoring-apply">
                  Apply
                </button>
              </div>
            </form>
            {lastParsed && (
              <p className="parsed-preview">
                Parsed: {describeParsed(lastParsed)}
              </p>
            )}
          </section>

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
          <section className="game-sheet-roster-column">
            <h3>Home (dark)</h3>
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
                {homePlayers.length === 0 ? (
                  <tr>
                    <td colSpan={8}>No roster yet.</td>
                  </tr>
                ) : (
                  homePlayers.map((p) => {
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
                {homePlayers.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No roster yet.</td>
                  </tr>
                ) : (
                  homePlayers.map((p) => {
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
          </section>
        </div>

        {/* Column 3: away roster + goals + fouls */}
        <div className="game-sheet-col">
          <section className="game-sheet-roster-column">
            <h3>Away (light)</h3>
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
                {awayPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={8}>No roster yet.</td>
                  </tr>
                ) : (
                  awayPlayers.map((p) => {
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
                {awayPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No roster yet.</td>
                  </tr>
                ) : (
                  awayPlayers.map((p) => {
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
          </section>
        </div>
      </div>
    </div>
  );
}

function parseScoreInput(raw: string): { ok: true; value: ParsedInput } | { ok: false; error: string } {
  const lower = raw.toLowerCase();

  if (lower === "sq") {
    return { ok: true, value: { raw, type: "START_QUARTER" } };
  }
  if (lower === "eq") {
    return { ok: true, value: { raw, type: "END_QUARTER" } };
  }

  // Timeout with time and side: 4.13tw or 4.13tb (t or t3 before side)
  const timeoutPattern = /^(\d+(\.\d{1,2})?)(t3?|t)(b|w)$/;
  const timeoutMatch = lower.match(timeoutPattern);
  if (timeoutMatch) {
    const timeSeconds = parseTimeToSeconds(timeoutMatch[1]);
    const action = timeoutMatch[3];
    const side = timeoutMatch[4] === "b" ? "HOME" : "AWAY";
    const type = action === "t3" ? "TIMEOUT_30" : "TIMEOUT";
    return { ok: true, value: { raw, type, timeSeconds, side } };
  }

  // General pattern: optional time, then side, optional cap, then action (g/e/p)
  const pattern = /^(\d*(\.\d{1,2})?)?(b|w)(\d+)?(g|e|p)$/;
  const match = lower.match(pattern);
  if (!match) {
    return {
      ok: false,
      error:
        "Invalid command. Examples: sq, eq, 6.07w13g, 5.53b2e, .03w7p, 4.13tw or 4.13t3w.",
    };
  }

  const timePart = match[1];
  const sideChar = match[3];
  const capPart = match[4];
  const action = match[5];

  const timeSeconds = timePart ? parseTimeToSeconds(timePart) : undefined;
  const side: TeamSide = sideChar === "b" ? "HOME" : "AWAY";

  if (!capPart && (action === "g" || action === "e" || action === "p")) {
    return { ok: false, error: "Cap number is required for goals, exclusions, and penalties." };
  }

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
  // formats: "6.07", ".03", "6"
  if (!time) return 0;
  if (time.startsWith(".")) {
    const seconds = Number(time.slice(1));
    return isNaN(seconds) ? 0 : seconds;
  }
  if (!time.includes(".")) {
    const minutes = Number(time);
    return isNaN(minutes) ? 0 : minutes * 60;
  }
  const [mStr, sStr] = time.split(".");
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

