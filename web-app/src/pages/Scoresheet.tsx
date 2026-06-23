import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type GameAggregate } from "../api/client";
import { ApiErrorDisplay } from "../components/DatabaseUnavailable";
import type { GameDay } from "../types/gameDay";
import {
  buildProgressRows,
  capSortKey,
  computeFoulsByPlayer,
  computeGoalsByPlayerAndPeriod,
  computeScoreByQuarter,
  computeTimeoutCalls,
  eventCellJustify,
  formatFoulSlot,
  sortGameEventsAsc,
  type ProgressRow,
} from "../lib/scoresheetData";
import "../scoresheet.css";

type TeamSide = "HOME" | "AWAY";

type RosterPlayer = GameAggregate["players"][number];

/** Minimum matrix rows per team so the printed form looks like a standard blank sheet. */
const MIN_ROSTER_ROWS = 15;
/** Minimum chronology rows per column. */
const MIN_CHRON_ROWS = 13;
/** Number of continuous chronology columns filled top-to-bottom, left-to-right. */
const CHRON_COLS = 6;

/** Printable landscape area at 0.35in margins (96px/in): 10.3in x 7.8in. */
const PAGE_W = 988;
const PAGE_H = 748;

function formatStartTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Dark = home = "D"; Light = away = "W" (matches the app's D/W convention). */
function teamLetter(side: TeamSide): "D" | "W" {
  return side === "HOME" ? "D" : "W";
}

interface MatrixGoals {
  q1: string;
  q2: string;
  q3: string;
  q4: string;
  ot: string;
  tot: string;
}

export function Scoresheet() {
  const { id: gameDayId, gameId } = useParams<{ id: string; gameId: string }>();
  const [gameDay, setGameDay] = useState<GameDay | null>(null);
  const [aggregate, setAggregate] = useState<GameAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, w: PAGE_W, h: 0 });

  useEffect(() => {
    if (!gameDayId || !gameId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loader on id change
    setLoading(true);
    Promise.all([api.gameDays.get(gameDayId), api.games.getAggregate(gameId)])
      .then(([gd, agg]) => {
        setGameDay(gd);
        setAggregate(agg);
      })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, [gameDayId, gameId]);

  const events = useMemo(() => aggregate?.events ?? [], [aggregate?.events]);

  const { goalsByPlayerAndPeriod, closedPeriods } = useMemo(
    () => computeGoalsByPlayerAndPeriod(events),
    [events]
  );
  const foulsByPlayer = useMemo(() => computeFoulsByPlayer(events), [events]);
  const timeoutCalls = useMemo(() => computeTimeoutCalls(events), [events]);
  const scoreByQuarter = useMemo(
    () =>
      computeScoreByQuarter(
        events,
        aggregate?.score?.homeScore ?? 0,
        aggregate?.score?.awayScore ?? 0
      ),
    [events, aggregate?.score?.homeScore, aggregate?.score?.awayScore]
  );
  // Chronology needs chronological (ascending) order so per-quarter grouping and the
  // period each event belongs to are correct. The API returns events newest-first.
  const progressRows = useMemo(() => {
    const ascending = [...events];
    sortGameEventsAsc(ascending);
    return buildProgressRows(ascending, foulsByPlayer);
  }, [events, foulsByPlayer]);

  // Measure the rendered sheet and scale it down uniformly so it always fits a
  // single landscape page. offsetWidth/Height ignore CSS transforms, so this is
  // stable across re-renders and doesn't loop.
  useLayoutEffect(() => {
    const el = paperRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!h) return;
    const scale = Math.min(1, PAGE_W / w, PAGE_H / h);
    setFit((prev) =>
      prev.w === w && prev.h === h && prev.scale === scale ? prev : { scale, w, h }
    );
  });

  if (loading) return <div className="page"><p>Loading…</p></div>;
  if (error) return <ApiErrorDisplay error={error} />;
  if (!gameDay || !aggregate) return <div className="page"><p>Game not found.</p></div>;

  const homeScore = aggregate.score?.homeScore ?? 0;
  const awayScore = aggregate.score?.awayScore ?? 0;
  const homeTimeouts = aggregate.timeoutStates?.find((t) => t.teamSide === "HOME");
  const awayTimeouts = aggregate.timeoutStates?.find((t) => t.teamSide === "AWAY");

  const rosterFor = (side: TeamSide): RosterPlayer[] =>
    (aggregate.players ?? [])
      .filter((p) => p.teamSide === side && p.playerName.trim().length > 0)
      .sort((a, b) => capSortKey(a.capNumber) - capSortKey(b.capNumber));

  const homePlayers = rosterFor("HOME");
  const awayPlayers = rosterFor("AWAY");

  const getMatrixGoals = (side: TeamSide, capNumber: string): MatrixGoals => {
    const byPeriod = goalsByPlayerAndPeriod[side]?.[capNumber];
    const cell = (period: number): string => {
      if (!byPeriod) return "";
      if (!closedPeriods.has(period)) return "";
      const n = byPeriod[period];
      return n ? String(n) : "";
    };
    let ot = 0;
    let tot = 0;
    if (byPeriod) {
      for (const [periodStr, count] of Object.entries(byPeriod)) {
        const period = Number(periodStr);
        if (!Number.isInteger(period) || count === undefined) continue;
        if (closedPeriods.has(period)) {
          tot += count;
          if (period >= 5) ot += count;
        }
      }
    }
    return {
      q1: cell(1),
      q2: cell(2),
      q3: cell(3),
      q4: cell(4),
      ot: ot ? String(ot) : "",
      tot: tot ? String(tot) : "",
    };
  };

  const getFoulSlots = (side: TeamSide, capNumber: string): [string, string, string] => {
    const arr = foulsByPlayer[side]?.[capNumber] ?? [];
    return [
      arr[0] ? formatFoulSlot(arr[0]) : "",
      arr[1] ? formatFoulSlot(arr[1]) : "",
      arr[2] ? formatFoulSlot(arr[2]) : "",
    ];
  };

  // Periods shown in the chronology: Q1-Q4 plus any overtime that has been reached.
  const maxProgressPeriod = progressRows.reduce(
    (max, r) => Math.max(max, r.period),
    0
  );
  const lastPeriod = Math.max(
    4,
    aggregate.currentPeriod,
    aggregate.totalPeriods,
    maxProgressPeriod
  );
  const chronPeriods: number[] = [];
  for (let p = 1; p <= lastPeriod; p += 1) chronPeriods.push(p);

  interface ChronEntry {
    id: string;
    time: string;
    capLabel: string;
    code: string;
    justify: "left" | "center" | "right";
    score: string;
  }

  const chronEntry = (row: ProgressRow): ChronEntry | null => {
    if (!row.chronologyCode) return null;
    const code = row.chronologyCode;
    const isTimeout = code.startsWith("T/O");
    const letter = row.side ? teamLetter(row.side) : "";
    const capLabel = isTimeout
      ? letter
      : `${letter}${row.cap !== "—" ? row.cap : ""}`;
    return {
      id: row.id,
      time: row.time,
      capLabel,
      code,
      justify: eventCellJustify(code),
      score: code === "G" && row.score !== "—" ? row.score : "",
    };
  };

  // The chronology reads as one continuous run (top to bottom, then left to
  // right across columns). A blacked-out row marks the end of each period.
  type ChronCell =
    | { kind: "entry"; entry: ChronEntry }
    | { kind: "blackout"; id: string };

  const chronCells: ChronCell[] = [];
  for (const period of chronPeriods) {
    const entries = progressRows
      .filter((r) => r.period === period)
      .map(chronEntry)
      .filter((e): e is ChronEntry => e != null);
    for (const entry of entries) chronCells.push({ kind: "entry", entry });
    const ended =
      period < aggregate.currentPeriod ||
      (aggregate.status === "FINAL" && period <= aggregate.currentPeriod) ||
      progressRows.some((r) => r.isQuarterEnd && r.period === period);
    if (ended) chronCells.push({ kind: "blackout", id: `period-end-${period}` });
  }

  const chronRowsPerCol = Math.max(
    MIN_CHRON_ROWS,
    Math.ceil(chronCells.length / CHRON_COLS)
  );
  const chronColumns: ChronCell[][] = Array.from({ length: CHRON_COLS }, (_, c) =>
    chronCells.slice(c * chronRowsPerCol, (c + 1) * chronRowsPerCol)
  );

  const sheetTitle = [aggregate.level, aggregate.gender, aggregate.gameType]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .join(" · ");

  const renderTeamBlock = (side: TeamSide, players: RosterPlayer[]) => {
    const isHome = side === "HOME";
    const teamName = isHome ? aggregate.homeTeamName : aggregate.awayTeamName;
    const colorLabel = isHome ? "Dark (D)" : "White (W)";
    const rowCount = Math.max(MIN_ROSTER_ROWS, players.length);
    return (
      <div className="ss-team-block">
        <div className="ss-team-head">
          <span className="ss-team-name">{teamName}</span>
          <span className="ss-team-color">Cap color: {colorLabel}</span>
        </div>
        <table className="ss-table ss-matrix">
          <thead>
            <tr>
              <th className="ss-col-cap">Cap</th>
              <th className="ss-col-name">Name</th>
              <th>1</th>
              <th>2</th>
              <th>3</th>
              <th>4</th>
              <th>OT</th>
              <th>Tot</th>
              <th>F1</th>
              <th>F2</th>
              <th>F3</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }, (_, index) => {
              const p = players[index];
              if (!p) {
                return (
                  <tr key={`${side}-empty-${index}`}>
                    <td className="ss-col-cap">&nbsp;</td>
                    <td className="ss-col-name">&nbsp;</td>
                    <td></td><td></td><td></td><td></td>
                    <td></td><td></td>
                    <td></td><td></td><td></td>
                  </tr>
                );
              }
              const g = getMatrixGoals(side, p.capNumber);
              const [f1, f2, f3] = getFoulSlots(side, p.capNumber);
              const fouledOut = (foulsByPlayer[side]?.[p.capNumber]?.length ?? 0) >= 3;
              return (
                <tr key={p.id} className={fouledOut ? "ss-row-fouled-out" : undefined}>
                  <td className="ss-col-cap">{p.capNumber}</td>
                  <td className="ss-col-name">{p.playerName}</td>
                  <td>{g.q1}</td>
                  <td>{g.q2}</td>
                  <td>{g.q3}</td>
                  <td>{g.q4}</td>
                  <td>{g.ot}</td>
                  <td className="ss-cell-tot">{g.tot}</td>
                  <td className="ss-cell-foul">{f1}</td>
                  <td className="ss-cell-foul">{f2}</td>
                  <td className="ss-cell-foul">{f3}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderTimeoutRow = (label: string, calls: { full: string[]; short: string[] }) => (
    <tr>
      <td className="ss-to-team">{label}</td>
      <td>{calls.full[0] ?? ""}</td>
      <td>{calls.full[1] ?? ""}</td>
      <td>{calls.full[2] ?? ""}</td>
      <td>{calls.short[0] ?? ""}</td>
    </tr>
  );

  const blankLine = (label: string) => (
    <div className="ss-field">
      <span className="ss-field-label">{label}</span>
      <span className="ss-field-line" />
    </div>
  );

  return (
    <div className="ss-screen">
      <div className="ss-toolbar">
        <Link to={gameDayId ? `/game-days/${gameDayId}/games/${gameId}/sheet` : "/"}>
          ← Back to game sheet
        </Link>
        <button type="button" className="btn primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      <div
        className="ss-fit"
        style={{
          width: fit.w * fit.scale,
          height: fit.h ? fit.h * fit.scale : undefined,
        }}
      >
        <div
          className="ss-paper"
          ref={paperRef}
          style={fit.scale !== 1 ? { transform: `scale(${fit.scale})` } : undefined}
        >
        {/* Header band */}
        <div className="ss-header">
          <div className="ss-title-row">
            <h1 className="ss-title">Water Polo Score Sheet</h1>
            <div className="ss-final">
              <span className="ss-final-label">Final</span>
              <span className="ss-final-score">
                D {homeScore} &nbsp;–&nbsp; W {awayScore}
              </span>
            </div>
          </div>
          <div className="ss-header-fields">
            <div className="ss-field">
              <span className="ss-field-label">Date</span>
              <span className="ss-field-value">{gameDay.date}</span>
            </div>
            <div className="ss-field">
              <span className="ss-field-label">Location</span>
              <span className="ss-field-value">{gameDay.location}</span>
            </div>
            <div className="ss-field">
              <span className="ss-field-label">Start</span>
              <span className="ss-field-value">
                {formatStartTime(aggregate.scheduledAt) || <span className="ss-field-line" />}
              </span>
            </div>
            {blankLine("Finish")}
            {blankLine("Game #")}
            {blankLine("Division")}
          </div>
          <div className="ss-header-fields">
            <div className="ss-field ss-field-wide">
              <span className="ss-field-label">Dark (Home)</span>
              <span className="ss-field-value">{aggregate.homeTeamName}</span>
            </div>
            <div className="ss-field ss-field-wide">
              <span className="ss-field-label">White (Away)</span>
              <span className="ss-field-value">{aggregate.awayTeamName}</span>
            </div>
            {sheetTitle ? (
              <div className="ss-field ss-field-wide">
                <span className="ss-field-label">Level</span>
                <span className="ss-field-value">{sheetTitle}</span>
              </div>
            ) : (
              blankLine("Level")
            )}
          </div>
        </div>

        {/* Rosters: White (away) left, Dark (home) right — traditional arrangement */}
        <div className="ss-teams">
          {renderTeamBlock("AWAY", awayPlayers)}
          {renderTeamBlock("HOME", homePlayers)}
        </div>

        {/* Results + timeouts */}
        <div className="ss-summary">
          <div className="ss-results">
            <h2 className="ss-section-title">Results</h2>
            <table className="ss-table ss-results-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>D</th>
                  <th>W</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>1</td><td>{scoreByQuarter.q1.home}</td><td>{scoreByQuarter.q1.away}</td></tr>
                <tr><td>2</td><td>{scoreByQuarter.q2.home}</td><td>{scoreByQuarter.q2.away}</td></tr>
                <tr><td>3</td><td>{scoreByQuarter.q3.home}</td><td>{scoreByQuarter.q3.away}</td></tr>
                <tr><td>4</td><td>{scoreByQuarter.q4.home}</td><td>{scoreByQuarter.q4.away}</td></tr>
                <tr><td>OT</td><td>{scoreByQuarter.ot.home || ""}</td><td>{scoreByQuarter.ot.away || ""}</td></tr>
                <tr className="ss-results-final">
                  <td>Total</td>
                  <td>{scoreByQuarter.final.home}</td>
                  <td>{scoreByQuarter.final.away}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="ss-timeouts">
            <h2 className="ss-section-title">Timeouts (time/qtr)</h2>
            <table className="ss-table ss-timeouts-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>T1</th>
                  <th>T2</th>
                  <th>T3</th>
                  <th>20s</th>
                </tr>
              </thead>
              <tbody>
                {renderTimeoutRow("Dark", timeoutCalls.HOME)}
                {renderTimeoutRow("White", timeoutCalls.AWAY)}
              </tbody>
            </table>
            <p className="ss-timeouts-remaining">
              Remaining — Dark: F {homeTimeouts?.fullTimeoutsRemaining ?? 0} / 20s{" "}
              {homeTimeouts?.shortTimeoutsRemaining ?? 0} · White: F{" "}
              {awayTimeouts?.fullTimeoutsRemaining ?? 0} / 20s{" "}
              {awayTimeouts?.shortTimeoutsRemaining ?? 0}
            </p>
          </div>
        </div>

        {/* Progress of game (chronology), per-quarter columns */}
        <div className="ss-progress">
          <h2 className="ss-section-title">
            Progress of Game{" "}
            <span className="ss-legend">
              (G goal · E exclusion · P penalty · T/O timeout · blacked row = period end)
            </span>
          </h2>
          <div className="ss-chron">
            {chronColumns.map((cells, colIndex) => (
              <table className="ss-table ss-chron-table" key={`chron-col-${colIndex}`}>
                <thead>
                  <tr>
                    <th className="ss-chron-time">Time</th>
                    <th className="ss-chron-cap">Cap</th>
                    <th className="ss-chron-event">Event</th>
                    <th className="ss-chron-score">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: chronRowsPerCol }, (_, rowIndex) => {
                    const cell = cells[rowIndex];
                    if (cell?.kind === "blackout") {
                      return (
                        <tr key={cell.id} className="ss-chron-blackout">
                          <td></td><td></td><td></td><td></td>
                        </tr>
                      );
                    }
                    if (!cell) {
                      return (
                        <tr key={`blank-${colIndex}-${rowIndex}`}>
                          <td></td><td></td><td></td><td></td>
                        </tr>
                      );
                    }
                    const entry = cell.entry;
                    return (
                      <tr key={entry.id}>
                        <td className="ss-chron-time">{entry.time}</td>
                        <td className="ss-chron-cap">{entry.capLabel}</td>
                        <td className={`ss-chron-event ss-just-${entry.justify}`}>
                          {entry.code}
                        </td>
                        <td className="ss-chron-score">{entry.score}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}
          </div>
        </div>

        {/* Signatures */}
        <div className="ss-signatures">
          {blankLine("Referee 1 (print)")}
          {blankLine("Referee 1 signature")}
          {blankLine("Referee 2 (print)")}
          {blankLine("Referee 2 signature")}
          {blankLine("Scorekeeper / Secretary")}
          {blankLine("Coach verification")}
        </div>
        </div>
      </div>
    </div>
  );
}
