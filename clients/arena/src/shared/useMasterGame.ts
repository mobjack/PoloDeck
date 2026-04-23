import { useEffect, useMemo, useState } from "react";
import { listGames } from "./api";
import type { GameListItem } from "./types";

function pickMasterGame(games: GameListItem[]): GameListItem | null {
  const inProgress = games.find((g) => g.status === "IN_PROGRESS");
  if (inProgress) return inProgress;

  const pending = games.find((g) => g.status === "PENDING");
  if (pending) return pending;

  return games[0] ?? null;
}

export function useMasterGame(apiBase: string) {
  const [games, setGames] = useState<GameListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      listGames(apiBase)
        .then((next) => {
          if (cancelled) return;
          setGames(next);
          setError(null);
        })
        .catch((e) => {
          if (cancelled) return;
          setError(e);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    setLoading(true);
    refresh();
    const id = window.setInterval(refresh, 8000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [apiBase]);

  const selectedGame = useMemo(() => pickMasterGame(games), [games]);

  return {
    gameId: selectedGame?.id,
    selectedGame,
    loading,
    error,
  };
}
