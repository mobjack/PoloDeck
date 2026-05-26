import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Socket } from "socket.io-client";
import { api, type GameAggregate } from "../api/client";
import { ApiErrorDisplay } from "../components/DatabaseUnavailable";
import { useKioskDeviceCheckIn } from "../hooks/useKioskDeviceCheckIn";
import {
  formatBreakCountdownDisplay,
  getBreakDisplayLabel,
  getBreakRemainingMs,
  isGameFinal,
  isOnBreak,
} from "../lib/clockDisplay";
import { createGameSocket } from "../lib/socketUrl";

type KioskScoreboardDisplayProps = {
  /** When set (e.g. server-managed kiosk), overrides `useParams` game id. */
  gameId?: string;
};

export function KioskScoreboardDisplay(props: KioskScoreboardDisplayProps) {
  const { gameId: routeGameId } = useParams<{ gameId: string }>();
  const gameId = props.gameId ?? routeGameId;
  const [aggregate, setAggregate] = useState<GameAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [now, setNow] = useState(() => Date.now());
  useKioskDeviceCheckIn();

  useEffect(() => {
    if (!gameId) return;
    let socket: Socket | null = null;
    const joinGame = () => {
      socket?.emit("game:join", { gameId });
    };
    void Promise.resolve().then(() => setLoading(true));

    api.games
      .getAggregate(gameId)
      .then((agg) => {
        setAggregate(agg);
        socket = createGameSocket();
        socket.on("connect", joinGame);
        joinGame();
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
        socket.off("connect", joinGame);
        socket.emit("game:leave", { gameId });
        socket.disconnect();
      }
    };
  }, [gameId]);

  const gameRunning = aggregate?.gameClock?.running ?? false;
  const onBreak = aggregate != null && isOnBreak(aggregate);

  useEffect(() => {
    if (!onBreak && !gameRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [onBreak, gameRunning]);

  if (loading) {
    return (
      <div className="kiosk-display-page kiosk-scoreboard-display">
        <p>Loading…</p>
      </div>
    );
  }
  if (error && !aggregate) {
    return (
      <div className="kiosk-display-page kiosk-scoreboard-display">
        <ApiErrorDisplay error={error} />
      </div>
    );
  }
  if (!gameId || !aggregate) {
    return (
      <div className="kiosk-display-page kiosk-scoreboard-display">
        <p>Game not found.</p>
      </div>
    );
  }

  const homeScore = aggregate.score?.homeScore ?? 0;
  const awayScore = aggregate.score?.awayScore ?? 0;
  const tp = aggregate.totalPeriods;
  const cp = aggregate.currentPeriod;
  const isFinal = isGameFinal(aggregate);

  const halfTimeActive = aggregate.breakPhase === "HALFTIME";
  const inP3 = !isFinal && cp === 3;
  const q3Active = inP3 && !halfTimeActive && !onBreak;

  const phaseActive = {
    q1: !isFinal && cp === 1 && !onBreak,
    q2: !isFinal && cp === 2 && !onBreak,
    ht: halfTimeActive,
    q3: q3Active,
    q4: !isFinal && cp === 4 && tp >= 4 && !onBreak,
    ot: !isFinal && cp === 5 && tp >= 5,
    final: isFinal,
  };

  const breakLabel = getBreakDisplayLabel(aggregate);
  const breakMs = onBreak ? getBreakRemainingMs(aggregate, now) : 0;

  return (
    <div
      className="kiosk-display-page kiosk-scoreboard-display"
      aria-label={`${aggregate.homeTeamName} vs ${aggregate.awayTeamName}, ${isFinal ? "final" : `period ${cp} of ${tp}`}`}
    >
      <div className="kiosk-display-columns">
        <section className="kiosk-display-side kiosk-display-side--dark" aria-label="Home">
          <div className="kiosk-display-team-label">Home · Dark</div>
          <div className="kiosk-display-team-name">{aggregate.homeTeamName}</div>
          <div className="kiosk-display-score">{homeScore}</div>
        </section>
        <section className="kiosk-display-side kiosk-display-side--light" aria-label="Guest">
          <div className="kiosk-display-team-label">Guest · Light</div>
          <div className="kiosk-display-team-name">{aggregate.awayTeamName}</div>
          <div className="kiosk-display-score">{awayScore}</div>
        </section>
      </div>

      <section className="kiosk-display-periods" aria-label="Period">
        <div className="kiosk-display-period-row">
          {isFinal ? (
            <span className="kiosk-phase is-active">Final</span>
          ) : (
            <>
              <span className={`kiosk-phase${phaseActive.q1 ? " is-active" : ""}`}>Q1</span>
              <span className={`kiosk-phase${phaseActive.q2 ? " is-active" : ""}`}>Q2</span>
              <span className={`kiosk-phase${phaseActive.ht ? " is-active" : ""}`}>HT</span>
              <span className={`kiosk-phase${phaseActive.q3 ? " is-active" : ""}`}>Q3</span>
              <span className={`kiosk-phase${phaseActive.q4 ? " is-active" : ""}`}>Q4</span>
              <span className={`kiosk-phase${phaseActive.ot ? " is-active" : ""}`}>OT</span>
            </>
          )}
        </div>
      </section>

      {onBreak && breakLabel ? (
        <section className="kiosk-scoreboard-break" aria-live="polite">
          <div className="kiosk-scoreboard-break-label">{breakLabel}</div>
          <div
            className={
              gameRunning
                ? "kiosk-scoreboard-break-time kiosk-scoreboard-break-time--running"
                : "kiosk-scoreboard-break-time"
            }
          >
            {formatBreakCountdownDisplay(breakMs)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
