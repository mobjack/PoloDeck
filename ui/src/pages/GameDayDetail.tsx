import { useEffect, useState } from "react";
import { ClipboardList, Settings, UserRoundCheck } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { GameDay, GameOnDay } from "../types/gameDay";
import { ApiErrorDisplay } from "../components/DatabaseUnavailable";

export function GameDayDetail() {
  const { id } = useParams<{ id: string }>();
  const [gameDay, setGameDay] = useState<GameDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!id) return;
    api.gameDays
      .get(id)
      .then((gd) => {
        setGameDay(gd);
      })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p>Loading…</p>;
  if (error) return <ApiErrorDisplay error={error} />;
  if (!gameDay) return <p>Game day not found.</p>;

  return (
    <div className="page">
      <header className="page-header">
        <Link to="/">← Game Days</Link>
        <h1>{gameDay.date} @ {gameDay.location}</h1>
        <Link to={`/game-days/${gameDay.id}/edit`} className="btn secondary">
          Edit day
        </Link>
      </header>

      <section className="games-section">
        <h2>Games</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Home (dark)</th>
              <th>Away (light)</th>
              <th>Score</th>
              <th>Level</th>
              <th>Type</th>
              <th>Gender</th>
              <th>Roster</th>
              <th>Game sheet</th>
              <th>Settings</th>
            </tr>
          </thead>
          <tbody>
            {gameDay.games.length === 0 ? (
              <tr>
              <td colSpan={10}>No games. Add one below.</td>
              </tr>
            ) : (
              gameDay.games.map((g) => (
                <GameRow key={g.id} game={g} gameDayId={gameDay.id} />
              ))
            )}
          </tbody>
        </table>
        <Link to={`/game-days/${gameDay.id}/games/new`} className="btn primary">
          Add game
        </Link>
      </section>
    </div>
  );
}

function GameRow({
  game,
  gameDayId,
}: {
  game: GameOnDay;
  gameDayId: string;
}) {
  const time = game.scheduledAt
    ? new Date(game.scheduledAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      })
    : "—";
  const score =
    game.score != null ? `${game.score.homeScore}-${game.score.awayScore}` : "—";
  return (
    <tr>
      <td>{time}</td>
      <td>{game.homeTeamName}</td>
      <td>{game.awayTeamName}</td>
      <td>{score}</td>
      <td>{game.level ?? "—"}</td>
      <td>{game.gameType ?? "—"}</td>
      <td>{game.gender ?? "—"}</td>
      <td className="games-action-cell">
        <Link
          to={`/game-days/${gameDayId}/games/${game.id}/roster`}
          className="btn btn-compact btn-games-row-action btn-roster-icon"
          aria-label="Edit Roster"
          title="Edit Roster"
        >
          <UserRoundCheck size={16} strokeWidth={2} aria-hidden />
        </Link>
      </td>
      <td className="games-action-cell">
        <Link
          to={`/game-days/${gameDayId}/games/${game.id}/sheet`}
          className="btn primary game-sheet-button btn-compact btn-games-row-action"
          aria-label="Edit Game Sheet"
          title="Edit Game Sheet"
        >
          <ClipboardList size={16} strokeWidth={2} aria-hidden />
        </Link>
      </td>
      <td className="games-action-cell">
        <Link
          to={`/game-days/${gameDayId}/games/${game.id}/edit`}
          className="btn secondary btn-compact btn-games-row-action btn-settings-gear"
          aria-label="Edit game"
          title="Edit game"
        >
          <Settings size={16} strokeWidth={2} aria-hidden />
        </Link>
      </td>
    </tr>
  );
}
