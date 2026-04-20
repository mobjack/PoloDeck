import { useEffect, useState } from "react";
import { ClipboardList, Settings, Tally5, UserRoundCheck } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { GameDay, GameOnDay } from "../types/gameDay";
import { ApiErrorDisplay, formatApiErrorMessage } from "../components/DatabaseUnavailable";

function isoToTimeInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

/** Combine game day date (YYYY-MM-DD) with a time input value (HH:MM) in local timezone. */
function timeInputToScheduledIso(gameDayDate: string, timeValue: string): string | null {
  const t = timeValue.trim();
  if (!t) return null;
  const parts = t.split(":");
  const hh = parseInt(parts[0] ?? "", 10);
  const mm = parseInt(parts[1] ?? "", 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const dateParts = gameDayDate.split("-").map((x) => parseInt(x, 10));
  const y = dateParts[0];
  const mo = dateParts[1];
  const d = dateParts[2];
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const local = new Date(y, mo - 1, d, hh, mm, 0, 0);
  return local.toISOString();
}

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

  if (loading) {
    return (
      <div className="game-day-detail-pane">
        <p>Loading…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="game-day-detail-pane">
        <ApiErrorDisplay error={error} />
      </div>
    );
  }
  if (!gameDay) {
    return (
      <div className="game-day-detail-pane">
        <p>Game day not found.</p>
      </div>
    );
  }

  const refreshGameDay = () => {
    if (!id) return;
    api.gameDays.get(id).then(setGameDay).catch(() => {
      /* keep prior data; errors are rare here */
    });
  };

  return (
    <div className="game-day-detail-pane">
      <header className="page-header game-day-detail-header">
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
              <th>Start time</th>
              <th>Home (dark)</th>
              <th>Away (light)</th>
              <th>Score</th>
              <th>Level</th>
              <th>Type</th>
              <th>Gender</th>
              <th>Roster</th>
              <th>Game sheet</th>
              <th>Scoreboard</th>
              <th>Settings</th>
            </tr>
          </thead>
          <tbody>
            {gameDay.games.length === 0 ? (
              <tr>
              <td colSpan={11}>No games. Add one below.</td>
              </tr>
            ) : (
              gameDay.games.map((g) => (
                <GameRow
                  key={g.id}
                  game={g}
                  gameDayId={gameDay.id}
                  gameDayDate={gameDay.date}
                  onStartTimeSaved={refreshGameDay}
                />
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
  gameDayDate,
  onStartTimeSaved,
}: {
  game: GameOnDay;
  gameDayId: string;
  gameDayDate: string;
  onStartTimeSaved: () => void;
}) {
  const [timeValue, setTimeValue] = useState(() => isoToTimeInputValue(game.scheduledAt));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTimeValue(isoToTimeInputValue(game.scheduledAt));
    setSaveError(null);
  }, [game.id, game.scheduledAt]);

  const commitStartTime = () => {
    setSaveError(null);
    const nextIso = timeInputToScheduledIso(gameDayDate, timeValue);
    const prevIso = game.scheduledAt;
    const nextT = nextIso != null ? new Date(nextIso).getTime() : null;
    const prevT = prevIso != null ? new Date(prevIso).getTime() : null;
    if (nextT === prevT) return;

    setSaving(true);
    api.games
      .update(game.id, { scheduledAt: nextIso })
      .then(() => {
        onStartTimeSaved();
      })
      .catch((e: unknown) => {
        setSaveError(formatApiErrorMessage(e));
        setTimeValue(isoToTimeInputValue(game.scheduledAt));
      })
      .finally(() => setSaving(false));
  };

  const score =
    game.score != null ? `${game.score.homeScore}-${game.score.awayScore}` : "—";
  return (
    <tr>
      <td className="games-start-time-cell">
        <input
          type="time"
          className="games-start-time-input"
          value={timeValue}
          onChange={(e) => setTimeValue(e.target.value)}
          onBlur={commitStartTime}
          disabled={saving}
          aria-label={`Start time for ${game.homeTeamName} vs ${game.awayTeamName}`}
        />
        {saveError ? <span className="games-start-time-error">{saveError}</span> : null}
      </td>
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
          to={`/game-days/${gameDayId}/games/${game.id}/scoreboard`}
          className="btn btn-compact btn-games-row-action btn-scoreboard-tally"
          aria-label="Scoreboard"
          title="Scoreboard"
        >
          <Tally5 size={16} strokeWidth={2} aria-hidden />
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
