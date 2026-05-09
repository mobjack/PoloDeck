import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Socket } from "socket.io-client";
import { api, type GameAggregate } from "../api/client";
import { ApiErrorDisplay } from "../components/DatabaseUnavailable";
import { useKioskDeviceCheckIn } from "../hooks/useKioskDeviceCheckIn";
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
  useKioskDeviceCheckIn();

  useEffect(() => {
    if (!gameId) return;
    let socket: Socket | null = null;
    void Promise.resolve().then(() => setLoading(true));

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

  if (loading) {
    return (
      <div className="page kiosk-display-page">
        <p>Loading…</p>
      </div>
    );
  }
  if (error && !aggregate) {
    return (
      <div className="page kiosk-display-page">
        <ApiErrorDisplay error={error} />
      </div>
    );
  }
  if (!gameId || !aggregate) {
    return (
      <div className="page kiosk-display-page">
        <p>Game not found.</p>
      </div>
    );
  }

  const homeScore = aggregate.score?.homeScore ?? 0;
  const awayScore = aggregate.score?.awayScore ?? 0;
  const tp = aggregate.totalPeriods;
  const cp = aggregate.currentPeriod;
  const isFinal = aggregate.status === "FINAL";

  const phaseActive = {
    q1: !isFinal && cp === 1,
    q2: !isFinal && cp === 2,
    q3: !isFinal && cp === 3,
    q4: !isFinal && cp === 4 && tp >= 4,
    ot: !isFinal && cp === 5 && tp >= 5,
    final: isFinal,
  };

  return (
    <div className="page kiosk-display-page kiosk-scoreboard-display">
      <header className="kiosk-display-header">
        <h1 className="kiosk-display-title">
          {aggregate.homeTeamName} vs {aggregate.awayTeamName}
        </h1>
        <p className="kiosk-display-meta">Scoreboard · Period {cp} of {tp}</p>
      </header>

      <div className="kiosk-display-columns">
        <section className="kiosk-display-side kiosk-display-side--dark" aria-label="Home">
          <div className="kiosk-display-team-label">Home · Dark</div>
          <div className="kiosk-display-team-name">{aggregate.homeTeamName}</div>
          <div className="kiosk-display-score">{homeScore}</div>
        </section>
        <section className="kiosk-display-side kiosk-display-side--light" aria-label="Away">
          <div className="kiosk-display-team-label">Away · Light</div>
          <div className="kiosk-display-team-name">{aggregate.awayTeamName}</div>
          <div className="kiosk-display-score">{awayScore}</div>
        </section>
      </div>

      <section className="kiosk-display-periods" aria-label="Period">
        <div className="kiosk-display-period-row">
          <span className={`kiosk-phase${phaseActive.q1 ? " is-active" : ""}`}>Q1</span>
          <span className={`kiosk-phase${phaseActive.q2 ? " is-active" : ""}`}>Q2</span>
          <span className={`kiosk-phase${phaseActive.q3 ? " is-active" : ""}`}>Q3 / HT</span>
          <span className={`kiosk-phase${phaseActive.q4 ? " is-active" : ""}`}>Q4</span>
          <span className={`kiosk-phase${phaseActive.ot ? " is-active" : ""}`}>OT</span>
          <span className={`kiosk-phase${phaseActive.final ? " is-active" : ""}`}>Final</span>
        </div>
      </section>
    </div>
  );
}
