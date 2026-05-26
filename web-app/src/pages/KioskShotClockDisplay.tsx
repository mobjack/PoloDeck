import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Socket } from "socket.io-client";
import { api, type GameAggregate } from "../api/client";
import { ApiErrorDisplay } from "../components/DatabaseUnavailable";
import { useKioskDeviceCheckIn } from "../hooks/useKioskDeviceCheckIn";
import {
  formatGameTimeDisplay,
  formatShotClockDisplay,
  formatShotClockDuringBreak,
  getBreakDisplayLabel,
  getBreakRemainingMs,
  getEffectiveRemainingMs,
  isOnBreak,
} from "../lib/clockDisplay";
import { createGameSocket } from "../lib/socketUrl";

type KioskShotClockDisplayProps = {
  gameId?: string;
};

export function KioskShotClockDisplay(props: KioskShotClockDisplayProps) {
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
    const joinGame = () => {
      socket?.emit("game:join", { gameId });
    };

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
  const shotRunning = aggregate?.shotClock?.running ?? false;
  const onBreak = aggregate != null && isOnBreak(aggregate);
  const anyRunning = gameRunning || shotRunning;

  useEffect(() => {
    if (!anyRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [anyRunning]);

  if (loading) {
    return (
      <div className="kiosk-display-page kiosk-shotclock-display">
        <p>Loading…</p>
      </div>
    );
  }
  if (error && !aggregate) {
    return (
      <div className="kiosk-display-page kiosk-shotclock-display">
        <ApiErrorDisplay error={error} />
      </div>
    );
  }
  if (!gameId || !aggregate) {
    return (
      <div className="kiosk-display-page kiosk-shotclock-display">
        <p>Game not found.</p>
      </div>
    );
  }

  const breakLabel = getBreakDisplayLabel(aggregate);
  const breakMs = onBreak ? getBreakRemainingMs(aggregate, now) : 0;
  const gameMs = aggregate.gameClock
    ? getEffectiveRemainingMs(aggregate.gameClock, now)
    : 0;
  const shotMs = aggregate.shotClock
    ? getEffectiveRemainingMs(aggregate.shotClock, now)
    : 0;

  if (onBreak && breakLabel) {
    return (
      <div className="kiosk-display-page kiosk-shotclock-display" aria-live="polite">
        <div className="kiosk-shotclock-game" aria-label={`${breakLabel} remaining`}>
          {formatGameTimeDisplay(breakMs)}
        </div>
        <div className="kiosk-shotclock-shot kiosk-shotclock-break-label" aria-label="Shot clock">
          {formatShotClockDuringBreak()}
        </div>
      </div>
    );
  }

  return (
    <div className="kiosk-display-page kiosk-shotclock-display" aria-live="polite">
      <div className="kiosk-shotclock-game" aria-label="Game time">
        {formatGameTimeDisplay(gameMs)}
      </div>
      <div className="kiosk-shotclock-shot" aria-label="Shot clock">
        {formatShotClockDisplay(shotMs)}
      </div>
    </div>
  );
}
