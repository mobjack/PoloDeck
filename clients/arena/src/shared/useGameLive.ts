import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { fetchGameAggregate } from "./api";
import type { GameAggregate } from "./types";

export function useGameLive(socketUrl: string, apiBase: string, gameId: string | undefined) {
  const [aggregate, setAggregate] = useState<GameAggregate | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(Boolean(gameId));
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!gameId) {
      setLoading(false);
      setAggregate(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchGameAggregate(apiBase, gameId)
      .then((agg) => {
        if (!cancelled) setAggregate(agg);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const socket = io(socketUrl, { transports: ["websocket"] });
    socketRef.current = socket;
    socket.emit("game:join", { gameId });
    socket.on("game:stateUpdated", (payload: { gameId: string; aggregate: GameAggregate }) => {
      if (payload.gameId === gameId) {
        setAggregate(payload.aggregate);
        setError(null);
      }
    });

    return () => {
      cancelled = true;
      socket.emit("game:leave", { gameId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [socketUrl, apiBase, gameId]);

  return { aggregate, error, loading };
}
