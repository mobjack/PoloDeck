import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, isDatabaseUnavailableError } from "../api/client";
import {
  DatabaseUnavailable,
  formatApiErrorMessage,
} from "../components/DatabaseUnavailable";
import type { UpdateGameInput } from "../types/gameDay";

const LEVELS = ["Varsity", "JV", "14U", "16U", "18U", ""];
const GENDERS = ["Boys", "Girls", "Co-ed", ""];
const GAME_TYPES = ["League", "Tournament", "Scrimmage", "Practice", ""];
const MS_PER_MIN = 60 * 1000;
function msToMinutes(ms: number): number {
  return Math.round(ms / MS_PER_MIN);
}
function minutesToMs(m: number): number {
  return m * MS_PER_MIN;
}

export function EditGame() {
  const { id: gameDayId, gameId } = useParams<{ id: string; gameId: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);
  const [form, setForm] = useState<UpdateGameInput>({});

  useEffect(() => {
    if (!gameDayId || !gameId) return;
    api.gameDays
      .get(gameDayId)
      .then((gd) => {
        const game = gd.games.find((g) => g.id === gameId);
        if (game) {
          setForm({
            homeTeamName: game.homeTeamName,
            awayTeamName: game.awayTeamName,
            level: game.level,
            gender: game.gender,
            gameType: game.gameType,
            quarterDurationMs: game.quarterDurationMs,
            breakBetweenQuartersDurationMs: game.breakBetweenQuartersDurationMs,
            halftimeDurationMs: game.halftimeDurationMs,
          });
        }
      })
      .catch((e) => setError(e));
  }, [gameDayId, gameId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gameId) return;
    setError(null);
    const body: UpdateGameInput = {
      ...form,
      level: form.level || null,
      gender: form.gender || null,
      gameType: form.gameType || null,
      quarterDurationMs: form.quarterDurationMs,
      breakBetweenQuartersDurationMs: form.breakBetweenQuartersDurationMs,
      halftimeDurationMs: form.halftimeDurationMs,
    };
    api.games
      .update(gameId, body)
      .then(() => navigate(`/game-days/${gameDayId}`))
      .catch((e) => setError(e));
  };

  if (isDatabaseUnavailableError(error)) {
    return <DatabaseUnavailable />;
  }

  return (
    <div className="page">
      <header className="page-header">
        <Link to={`/game-days/${gameDayId}`}>← Back to game day</Link>
        <h1>Edit game</h1>
      </header>

      <form onSubmit={handleSubmit} className="form">
        {error && <p className="error">{formatApiErrorMessage(error)}</p>}
        <label>
          Home team (dark caps)
          <input
            type="text"
            value={form.homeTeamName ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, homeTeamName: e.target.value }))}
            required
          />
        </label>
        <label>
          Away team (light caps)
          <input
            type="text"
            value={form.awayTeamName ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, awayTeamName: e.target.value }))}
            required
          />
        </label>
        <label>
          Level
          <select
            value={form.level ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, level: e.target.value || null }))}
          >
            {LEVELS.map((v) => (
              <option key={v || "x"} value={v}>{v || "—"}</option>
            ))}
          </select>
        </label>
        <label>
          Gender
          <select
            value={form.gender ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value || null }))}
          >
            {GENDERS.map((v) => (
              <option key={v || "x"} value={v}>{v || "—"}</option>
            ))}
          </select>
        </label>
        <label>
          Game type
          <select
            value={form.gameType ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, gameType: e.target.value || null }))}
          >
            {GAME_TYPES.map((v) => (
              <option key={v || "x"} value={v}>{v || "—"}</option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Timing</legend>
          <label>
            Quarter length (minutes)
            <input
              type="number"
              min={1}
              value={form.quarterDurationMs != null ? msToMinutes(form.quarterDurationMs) : ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, quarterDurationMs: minutesToMs(Number(e.target.value)) }))
              }
            />
          </label>
          <label>
            Break between quarters (minutes)
            <input
              type="number"
              min={0}
              value={form.breakBetweenQuartersDurationMs != null ? msToMinutes(form.breakBetweenQuartersDurationMs) : ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  breakBetweenQuartersDurationMs: minutesToMs(Number(e.target.value)),
                }))
              }
            />
          </label>
          <label>
            Halftime (minutes)
            <input
              type="number"
              min={0}
              value={form.halftimeDurationMs != null ? msToMinutes(form.halftimeDurationMs) : ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, halftimeDurationMs: minutesToMs(Number(e.target.value)) }))
              }
            />
          </label>
        </fieldset>
        <div className="form-actions">
          <button type="submit" className="btn primary">
            Save
          </button>
          <Link to={`/game-days/${gameDayId}`} className="btn secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
