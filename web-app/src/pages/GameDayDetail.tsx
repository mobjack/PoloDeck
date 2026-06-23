import { useEffect, useState } from "react";
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
  const [liveError, setLiveError] = useState<string | null>(null);
  const [settingLiveId, setSettingLiveId] = useState<string | null>(null);

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

  const setLiveGame = async (gameId: string) => {
    if (!id || gameDay.activeGameId === gameId) return;
    setLiveError(null);
    setSettingLiveId(gameId);
    try {
      const updated = await api.gameDays.setActiveGame(id, gameId);
      setGameDay(updated);
    } catch (e: unknown) {
      setLiveError(formatApiErrorMessage(e));
    } finally {
      setSettingLiveId(null);
    }
  };

  return (
    <div className="game-day-detail-pane">
      <header className="page-header game-day-detail-header">
        <h1>
          {gameDay.date} @ {gameDay.location}
        </h1>
        <div className="game-day-detail-header-actions">
          <Link to="/kiosks" className="btn secondary">
            Manage kiosks
          </Link>
          <Link to={`/game-days/${gameDay.id}/edit`} className="btn secondary">
            Edit day
          </Link>
        </div>
      </header>

      <section className="games-section games-section--cards">
        <h2>Games</h2>
        <p className="games-section-hint">
          Choose which game is <strong>live on displays</strong>. All activated kiosks follow that game
          (displays pick up the change within a few seconds).
        </p>
        {liveError ? <p className="games-live-error">{liveError}</p> : null}

        {gameDay.games.length === 0 ? (
          <p className="games-section-empty">No games. Add one below.</p>
        ) : (
          <ul className="game-card-list">
            {gameDay.games.map((g) => (
              <GameCard
                key={g.id}
                game={g}
                gameDayId={gameDay.id}
                gameDayDate={gameDay.date}
                isLive={gameDay.activeGameId === g.id}
                liveBusy={settingLiveId === g.id}
                onSetLive={() => setLiveGame(g.id)}
                onStartTimeSaved={refreshGameDay}
              />
            ))}
          </ul>
        )}

        <Link to={`/game-days/${gameDay.id}/games/new`} className="btn primary">
          Add game
        </Link>
      </section>
    </div>
  );
}

function GameCard({
  game,
  gameDayId,
  gameDayDate,
  isLive,
  liveBusy,
  onSetLive,
  onStartTimeSaved,
}: {
  game: GameOnDay;
  gameDayId: string;
  gameDayDate: string;
  isLive: boolean;
  liveBusy: boolean;
  onSetLive: () => void;
  onStartTimeSaved: () => void;
}) {
  const [timeValue, setTimeValue] = useState(() => isoToTimeInputValue(game.scheduledAt));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- sync local fields when server row changes */
  useEffect(() => {
    setSaveError(null);
    setTimeValue(isoToTimeInputValue(game.scheduledAt));
  }, [game.id, game.scheduledAt]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
    <li className={`game-card${isLive ? " game-card--live" : ""}`}>
      <div className="game-card-header">
        <div className="game-card-matchup">
          <span className="game-card-teams">
            {game.homeTeamName} vs {game.awayTeamName}
          </span>
          <span className="game-card-score">{score}</span>
        </div>
        <label className="game-card-live">
          <input
            type="radio"
            name={`live-game-${gameDayId}`}
            checked={isLive}
            disabled={liveBusy}
            onChange={onSetLive}
            aria-label={`Live on displays: ${game.homeTeamName} vs ${game.awayTeamName}`}
          />
          <span>Live on displays</span>
        </label>
      </div>

      <div className="game-card-meta">
        <label className="game-card-meta-item">
          <span className="game-card-meta-label">Start</span>
          <input
            type="time"
            className="games-start-time-input"
            value={timeValue}
            onChange={(e) => setTimeValue(e.target.value)}
            onBlur={commitStartTime}
            disabled={saving}
          />
        </label>
        {game.level ? (
          <span className="game-card-meta-item">
            <span className="game-card-meta-label">Level</span> {game.level}
          </span>
        ) : null}
        {game.gameType ? (
          <span className="game-card-meta-item">
            <span className="game-card-meta-label">Type</span> {game.gameType}
          </span>
        ) : null}
        {game.gender ? (
          <span className="game-card-meta-item">
            <span className="game-card-meta-label">Gender</span> {game.gender}
          </span>
        ) : null}
        {saveError ? <span className="games-start-time-error">{saveError}</span> : null}
      </div>

      <div className="game-card-actions">
        <Link
          to={`/game-days/${gameDayId}/games/${game.id}/roster`}
          className="btn btn-compact secondary"
        >
          Roster
        </Link>
        <Link
          to={`/game-days/${gameDayId}/games/${game.id}/sheet`}
          className="btn btn-compact primary"
        >
          Game sheet
        </Link>
        <Link
          to={`/game-days/${gameDayId}/games/${game.id}/scoresheet`}
          className="btn btn-compact secondary"
        >
          Scoresheet
        </Link>
        <Link
          to={`/game-days/${gameDayId}/games/${game.id}/scoreboard`}
          className="btn btn-compact secondary"
        >
          Scoreboard
        </Link>
        <Link to="/timer" className="btn btn-compact secondary">
          Timer
        </Link>
        <Link
          to={`/game-days/${gameDayId}/games/${game.id}/edit`}
          className="btn btn-compact secondary"
        >
          Edit game
        </Link>
      </div>
    </li>
  );
}
