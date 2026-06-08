import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { createGameSocket } from "../lib/socketUrl";
import { api, type ActiveGameSummary } from "../api/client";

export interface ActiveGameState {
  activeGame: ActiveGameSummary | null;
  loading: boolean;
  error: unknown;
}

/**
 * Follows the server-authoritative active game. The client never picks a game; it
 * loads the current active game and updates whenever the server broadcasts a change.
 */
export function useActiveGame(): ActiveGameState {
  const [activeGame, setActiveGame] = useState<ActiveGameSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    let socket: Socket | null = null;

    const load = () => {
      api.activeGame()
        .then((g) => {
          if (cancelled) return;
          setActiveGame(g);
          setError(null);
        })
        .catch((e) => {
          if (!cancelled) setError(e);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    load();

    socket = createGameSocket();
    socket.on("active-game:changed", (payload: { activeGame: ActiveGameSummary | null }) => {
      if (!cancelled) setActiveGame(payload.activeGame);
    });
    // Re-sync after any reconnect in case we missed a change while offline.
    socket.on("connect", load);

    return () => {
      cancelled = true;
      if (socket) socket.disconnect();
    };
  }, []);

  return { activeGame, loading, error };
}
