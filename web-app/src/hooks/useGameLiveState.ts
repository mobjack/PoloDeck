import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { createGameSocket } from "../lib/socketUrl";
import { api, type GameAggregate } from "../api/client";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline";

export interface GameLiveState {
  aggregate: GameAggregate | null;
  loading: boolean;
  error: unknown;
  connection: ConnectionStatus;
  /** Wall-clock ms; advances ~10x/sec while a clock is running for smooth display. */
  nowMs: number;
  /** Replace the local aggregate (e.g. after a command returns a fresh snapshot). */
  setAggregate: (next: GameAggregate) => void;
}

/**
 * Loads a game aggregate, subscribes to live `game:stateUpdated` updates over the
 * shared socket, tracks connection status, and ticks while clocks run so callers can
 * interpolate remaining time. Pass `null` when there is no game to follow.
 */
export function useGameLiveState(gameId: string | null | undefined): GameLiveState {
  const [aggregate, setAggregate] = useState<GameAggregate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [nowMs, setNowMs] = useState(() => Date.now());

  /* eslint-disable react-hooks/set-state-in-effect -- reset/load state when the followed game id changes */
  useEffect(() => {
    if (!gameId) {
      setAggregate(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    let socket: Socket | null = null;
    // Clear any prior game's snapshot so we never show a stale matchup while loading.
    setAggregate(null);
    setLoading(true);
    setError(null);

    const applyConnection = () => {
      if (cancelled) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setConnection("offline");
        return;
      }
      setConnection(socket?.connected ? "connected" : "reconnecting");
    };

    api.games
      .getAggregate(gameId)
      .then((agg) => {
        if (cancelled) return;
        setAggregate(agg);
        socket = createGameSocket();
        socket.emit("game:join", { gameId });
        socket.on("game:stateUpdated", (payload: { gameId: string; aggregate: GameAggregate }) => {
          if (payload.gameId === gameId) setAggregate(payload.aggregate);
        });
        socket.on("connect", () => {
          if (!cancelled) socket?.emit("game:join", { gameId });
          applyConnection();
        });
        socket.on("disconnect", applyConnection);
        socket.io.on("reconnect_attempt", applyConnection);
        socket.io.on("error", applyConnection);
        applyConnection();
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const onOnline = () => applyConnection();
    const onOffline = () => applyConnection();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (socket) {
        socket.emit("game:leave", { gameId });
        socket.disconnect();
      }
    };
  }, [gameId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const gameRunning = aggregate?.gameClock?.running ?? false;
  const shotRunning = aggregate?.shotClock?.running ?? false;
  const anyRunning = gameRunning || shotRunning;

  useEffect(() => {
    if (!anyRunning) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [anyRunning]);

  return { aggregate, loading, error, connection, nowMs, setAggregate };
}
