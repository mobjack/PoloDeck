import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Socket } from "socket.io-client";
import { api, type GameAggregate } from "../api/client";
import { ApiErrorDisplay } from "../components/DatabaseUnavailable";
import { useKioskDeviceCheckIn } from "../hooks/useKioskDeviceCheckIn";
import {
  formatShotClockDisplay,
  getEffectiveRemainingMs,
} from "../lib/clockDisplay";
import { createGameSocket } from "../lib/socketUrl";

export function KioskShotClockDisplay() {
  const { gameId } = useParams<{ gameId: string }>();
  const [aggregate, setAggregate] = useState<GameAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [now, setNow] = useState(() => Date.now());
  useKioskDeviceCheckIn("SHOT_CLOCK");

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

  const shotRunning = aggregate?.shotClock?.running ?? false;
  useEffect(() => {
    if (!shotRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [shotRunning]);

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

  const shotMs = aggregate.shotClock
    ? getEffectiveRemainingMs(aggregate.shotClock, now)
    : 0;

  return (
    <div className="page kiosk-display-page kiosk-shot-display">
      <p className="kiosk-shot-meta">
        {aggregate.homeTeamName} vs {aggregate.awayTeamName}
      </p>
      <div className="kiosk-shot-digits" aria-live="polite">
        {formatShotClockDisplay(shotMs)}
      </div>
      <p className="kiosk-shot-label">Shot clock</p>
    </div>
  );
}
