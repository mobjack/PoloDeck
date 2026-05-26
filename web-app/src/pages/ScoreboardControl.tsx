import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Socket } from "socket.io-client";
import { createGameSocket } from "../lib/socketUrl";
import { api, type GameAggregate } from "../api/client";
import { ApiErrorDisplay } from "../components/DatabaseUnavailable";
import { isOnBreak } from "../lib/clockDisplay";

export function ScoreboardControl() {
  const { id: gameDayId, gameId } = useParams<{ id: string; gameId: string }>();
  const [aggregate, setAggregate] = useState<GameAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!gameId) return;
    setLoading(true);
    let socket: Socket | null = null;

    api.games
      .getAggregate(gameId)
      .then((agg) => {
        setAggregate(agg);
        socket = createGameSocket();
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
  }, [gameId]);

  const run = useCallback(async (fn: () => Promise<GameAggregate>) => {
    if (!gameId || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      setAggregate(next);
    } catch (e) {
      setError(e);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [gameId]);

  if (loading) {
    return (
      <div className="page scoreboard-control-page">
        <p>Loading…</p>
      </div>
    );
  }
  if (error && !aggregate) {
    return (
      <div className="page scoreboard-control-page">
        <ApiErrorDisplay error={error} />
      </div>
    );
  }
  if (!gameId || !aggregate) {
    return (
      <div className="page scoreboard-control-page">
        <p>Game not found.</p>
      </div>
    );
  }

  const homeScore = aggregate.score?.homeScore ?? 0;
  const awayScore = aggregate.score?.awayScore ?? 0;
  const tp = aggregate.totalPeriods;
  const cp = aggregate.currentPeriod;
  const isFinal = aggregate.status === "FINAL";
  const periodHeading = isFinal ? "Final" : "Period";
  const onBreak = isOnBreak(aggregate);

  const halfTimeActive = aggregate.breakPhase === "HALFTIME";
  const inP3 = !isFinal && cp === 3;
  const q3Active = inP3 && !halfTimeActive && !onBreak;

  const phaseActive = {
    q1: !isFinal && cp === 1 && !onBreak,
    q2: !isFinal && cp === 2 && !onBreak,
    q4: !isFinal && cp === 4 && tp >= 4 && !onBreak,
    ot: !isFinal && cp === 5 && tp >= 5,
    final: isFinal,
  };

  return (
    <div className="page scoreboard-control-page">
      <header className="scoreboard-control-header">
        <div className="scoreboard-control-nav">
          <Link to={gameDayId ? `/game-days/${gameDayId}/games/${gameId}/sheet` : "/"}>
            ← Game progress
          </Link>
          {gameDayId ? (
            <Link to={`/game-days/${gameDayId}`} className="scoreboard-control-nav-secondary">
              Game day
            </Link>
          ) : null}
        </div>
        <h1 className="scoreboard-control-title">
          {aggregate.homeTeamName} vs {aggregate.awayTeamName}
        </h1>
        <p className="scoreboard-control-sub">
          Same game state as the progress page (Socket.IO updates both). +/− goals here have no cap
          numbers, so they pair cleanly with someone scoring by cap on the sheet.
        </p>
      </header>

      {error ? (
        <div className="scoreboard-control-error">
          <ApiErrorDisplay error={error} />
        </div>
      ) : null}

      <div className="scoreboard-control-columns">
        <section className="scoreboard-control-side scoreboard-control-side--dark" aria-label="Home team, dark caps">
          <div className="scoreboard-control-team-label">Home · Dark</div>
          <div className="scoreboard-control-team-name">{aggregate.homeTeamName}</div>
          <div className="scoreboard-control-score">{homeScore}</div>
          <div className="scoreboard-control-score-btns">
            <button
              type="button"
              className="btn scoreboard-control-big-btn scoreboard-control-big-btn--up"
              disabled={busy || isFinal}
              onClick={() => run(() => api.games.scoreHomeIncrement(gameId))}
            >
              +1
            </button>
            <button
              type="button"
              className="btn scoreboard-control-big-btn scoreboard-control-big-btn--down"
              disabled={busy || isFinal || homeScore <= 0}
              onClick={() => run(() => api.games.scoreHomeDecrement(gameId))}
            >
              −1
            </button>
          </div>
        </section>

        <section className="scoreboard-control-side scoreboard-control-side--light" aria-label="Away team, light caps">
          <div className="scoreboard-control-team-label">Away · Light</div>
          <div className="scoreboard-control-team-name">{aggregate.awayTeamName}</div>
          <div className="scoreboard-control-score">{awayScore}</div>
          <div className="scoreboard-control-score-btns">
            <button
              type="button"
              className="btn scoreboard-control-big-btn scoreboard-control-big-btn--up"
              disabled={busy || isFinal}
              onClick={() => run(() => api.games.scoreAwayIncrement(gameId))}
            >
              +1
            </button>
            <button
              type="button"
              className="btn scoreboard-control-big-btn scoreboard-control-big-btn--down"
              disabled={busy || isFinal || awayScore <= 0}
              onClick={() => run(() => api.games.scoreAwayDecrement(gameId))}
            >
              −1
            </button>
          </div>
        </section>
      </div>

      <section className="scoreboard-control-period" aria-label="Quarter or game phase">
        <h2 className="scoreboard-control-period-heading">{periodHeading}</h2>
        <div className="scoreboard-control-period-grid">
          {isFinal ? (
            <button
              type="button"
              className="btn scoreboard-control-phase-btn is-active"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api.games.setPeriod(gameId, tp);
                  return api.games.update(gameId, { status: "FINAL" });
                })
              }
            >
              Final
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`btn scoreboard-control-phase-btn${phaseActive.q1 ? " is-active" : ""}`}
                disabled={busy || tp < 1}
                onClick={() => run(() => api.games.setPeriod(gameId, 1))}
              >
                Q1
              </button>
              <button
                type="button"
                className={`btn scoreboard-control-phase-btn${phaseActive.q2 ? " is-active" : ""}`}
                disabled={busy || tp < 2}
                onClick={() => run(() => api.games.setPeriod(gameId, 2))}
              >
                Q2
              </button>
              <button
                type="button"
                className={`btn scoreboard-control-phase-btn${halfTimeActive ? " is-active" : ""}`}
                disabled={busy || tp < 3}
                onClick={() => run(() => api.games.setPeriod(gameId, 2, { halftime: true }))}
              >
                Half time
              </button>
              <button
                type="button"
                className={`btn scoreboard-control-phase-btn${q3Active ? " is-active" : ""}`}
                disabled={busy || tp < 3}
                onClick={() => run(() => api.games.setPeriod(gameId, 3))}
              >
                Q3
              </button>
              <button
                type="button"
                className={`btn scoreboard-control-phase-btn${phaseActive.q4 ? " is-active" : ""}`}
                disabled={busy || tp < 4}
                onClick={() => run(() => api.games.setPeriod(gameId, 4))}
              >
                Q4
              </button>
              <button
                type="button"
                className={`btn scoreboard-control-phase-btn${phaseActive.ot ? " is-active" : ""}`}
                disabled={busy || tp < 4}
                onClick={() => run(() => api.games.setPeriod(gameId, 5))}
                title="Overtime (expands to a 5th period if still in regulation)"
              >
                OT
              </button>
              <button
                type="button"
                className={`btn scoreboard-control-phase-btn${phaseActive.final ? " is-active" : ""}`}
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api.games.setPeriod(gameId, tp);
                    return api.games.update(gameId, { status: "FINAL" });
                  })
                }
              >
                Final
              </button>
            </>
          )}
        </div>
        <p className="scoreboard-control-period-note">
          Half time starts the halftime break after Q2 (scores stay on the board). Q3 clears halftime
          and selects the third quarter. On the game sheet, <strong>eq</strong> ends a quarter;{" "}
          <strong>sb</strong> or the Timer starts the break clock. Q4 is the last regulation quarter.
        </p>
      </section>
    </div>
  );
}
