import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Socket } from "socket.io-client";
import { api, type GameAggregate } from "../api/client";
import { ApiErrorDisplay } from "../components/DatabaseUnavailable";
import { useKioskDeviceCheckIn } from "../hooks/useKioskDeviceCheckIn";
import {
  formatGameTimeDisplay,
  formatShotClockDisplay,
  getEffectiveRemainingMs,
} from "../lib/clockDisplay";
import { createGameSocket } from "../lib/socketUrl";

type KioskTimerDisplayProps = {
  gameId?: string;
};

export function KioskTimerDisplay(props: KioskTimerDisplayProps) {
  const { gameId: routeGameId } = useParams<{ gameId: string }>();
  const gameId = props.gameId ?? routeGameId;
  const [aggregate, setAggregate] = useState<GameAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [now, setNow] = useState(() => Date.now());
  useKioskDeviceCheckIn();

  useEffect(() => {
    if (!gameId) return;
    void Promise.resolve().then(() => setLoading(true));
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

  const gameRunning = aggregate?.gameClock?.running ?? false;
  const shotRunning = aggregate?.shotClock?.running ?? false;
  const anyRunning = gameRunning || shotRunning;

  useEffect(() => {
    if (!anyRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [anyRunning]);

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

  const gameMs = aggregate.gameClock
    ? getEffectiveRemainingMs(aggregate.gameClock, now)
    : 0;
  const shotMs = aggregate.shotClock
    ? getEffectiveRemainingMs(aggregate.shotClock, now)
    : 0;

  return (
    <div className="page kiosk-display-page kiosk-timer-display">
      <header className="kiosk-display-header">
        <h1 className="kiosk-display-title kiosk-timer-title">Timer</h1>
        <p className="kiosk-display-meta">
          {aggregate.homeTeamName} vs {aggregate.awayTeamName} — Period {aggregate.currentPeriod} of{" "}
          {aggregate.totalPeriods}
        </p>
      </header>
      <div className="kiosk-timer-blocks" aria-live="polite">
        <section className="kiosk-timer-block" aria-label="Game time">
          <h2 className="kiosk-timer-block-label">Game time</h2>
          <div className="kiosk-timer-digits kiosk-timer-digits--game">{formatGameTimeDisplay(gameMs)}</div>
        </section>
        <section className="kiosk-timer-block" aria-label="Shot clock">
          <h2 className="kiosk-timer-block-label">Shot clock</h2>
          <div className="kiosk-timer-digits kiosk-timer-digits--shot">{formatShotClockDisplay(shotMs)}</div>
        </section>
      </div>
    </div>
  );
}
