import { useEffect, useState } from "react";
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

  if (loading) return <div className="page"><p>Loading…</p></div>;
  if (error) return <div className="page"><p className="error">Error: {error}</p></div>;
  if (!gameDay || !aggregate) return <div className="page"><p>Game not found.</p></div>;

  const homeScore = aggregate.score?.homeScore ?? 0;
  const awayScore = aggregate.score?.awayScore ?? 0;
  const homeTimeouts = aggregate.timeoutStates.find((t) => t.teamSide === "HOME");
  const awayTimeouts = aggregate.timeoutStates.find((t) => t.teamSide === "AWAY");

  const homePlayers = (aggregate.players ?? [])
    .filter((p) => p.teamSide === "HOME" && p.playerName.trim().length > 0)
    .sort((a, b) => a.capNumber.localeCompare(b.capNumber));
  const awayPlayers = (aggregate.players ?? [])
    .filter((p) => p.teamSide === "AWAY" && p.playerName.trim().length > 0)
    .sort((a, b) => a.capNumber.localeCompare(b.capNumber));

  const formatMsToClock = (ms: number | null | undefined) => {
    if (ms == null) return "—";
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
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
    // TODO: send to server endpoint that applies this event
    setInput("");
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
                <div>Game clock: {formatMsToClock(aggregate.gameClock?.remainingMs)}</div>
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
                  {/* TODO: render events from aggregate.events once wired */}
                  <tr>
                    <td colSpan={5}>No events yet.</td>
                  </tr>
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
                  homePlayers.map((p) => (
                    <tr key={p.id}>
                      <td>{p.capNumber}</td>
                      <td>{p.playerName}</td>
                      <td>-</td>
                      <td>-</td>
                      <td>-</td>
                      <td>-</td>
                      <td>-</td>
                      <td>-</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <h4 className="game-sheet-fouls-heading">Personal fouls</h4>
            <table className="table game-sheet-fouls-table">
              <thead>
                <tr>
                  <th>Cap#</th>
                  <th>Q1</th>
                  <th>Q2</th>
                  <th>Q3</th>
                  <th>Q4</th>
                  <th>OT</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6}>Fouls by quarter will show here.</td>
                </tr>
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
                  awayPlayers.map((p) => (
                    <tr key={p.id}>
                      <td>{p.capNumber}</td>
                      <td>{p.playerName}</td>
                      <td>-</td>
                      <td>-</td>
                      <td>-</td>
                      <td>-</td>
                      <td>-</td>
                      <td>-</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <h4 className="game-sheet-fouls-heading">Personal fouls</h4>
            <table className="table game-sheet-fouls-table">
              <thead>
                <tr>
                  <th>Cap#</th>
                  <th>Q1</th>
                  <th>Q2</th>
                  <th>Q3</th>
                  <th>Q4</th>
                  <th>OT</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6}>Fouls by quarter will show here.</td>
                </tr>
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

