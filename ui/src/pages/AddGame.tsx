import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, isDatabaseUnavailableError } from "../api/client";
import {
  DatabaseUnavailable,
  formatApiErrorMessage,
} from "../components/DatabaseUnavailable";
import type { CreateGameInput } from "../types/gameDay";

const LEVELS = ["Varsity", "JV", "14U", "16U", "18U", ""];
const GENDERS = ["Boys", "Girls", "Co-ed", ""];
const GAME_TYPES = ["League", "Tournament", "Scrimmage", "Practice", ""];
const DEFAULT_QUARTER_MS = 8 * 60 * 1000;
const DEFAULT_BREAK_MS = 2 * 60 * 1000;
const DEFAULT_HALFTIME_MS = 5 * 60 * 1000;

export function AddGame() {
  const { id: gameDayId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);
  const [form, setForm] = useState<CreateGameInput>({
    gameDayId: gameDayId ?? undefined,
    homeTeamName: "",
    awayTeamName: "",
    level: "",
    gender: "",
    gameType: "",
    quarterDurationMs: DEFAULT_QUARTER_MS,
    breakBetweenQuartersDurationMs: DEFAULT_BREAK_MS,
    halftimeDurationMs: DEFAULT_HALFTIME_MS,
  });

  useEffect(() => {
    if (!gameDayId) return;
    api.gameDays
      .get(gameDayId)
      .then((gd) => {
        setForm((f) => ({
          ...f,
          quarterDurationMs: gd.defaultQuarterDurationMs,
          breakBetweenQuartersDurationMs: gd.defaultBreakBetweenQuartersMs,
          halftimeDurationMs: gd.defaultHalftimeDurationMs,
        }));
      })
      .catch(() => {});
  }, [gameDayId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const body: CreateGameInput = {
      ...form,
      gameDayId: gameDayId ?? undefined,
      level: form.level || undefined,
      gender: form.gender || undefined,
      gameType: form.gameType || undefined,
      quarterDurationMs: form.quarterDurationMs,
      breakBetweenQuartersDurationMs: form.breakBetweenQuartersDurationMs,
      halftimeDurationMs: form.halftimeDurationMs,
    };
    api.games
      .create(body)
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
        <h1>Add game</h1>
      </header>

      <form onSubmit={handleSubmit} className="form">
        {error && <p className="error">{formatApiErrorMessage(error)}</p>}
        <label>
          Home team (dark caps)
          <input
            type="text"
            value={form.homeTeamName}
            onChange={(e) => setForm((f) => ({ ...f, homeTeamName: e.target.value }))}
            required
          />
        </label>
        <label>
          Away team (light caps)
          <input
            type="text"
            value={form.awayTeamName}
            onChange={(e) => setForm((f) => ({ ...f, awayTeamName: e.target.value }))}
            required
          />
        </label>
        <label>
          Level
          <select
            value={form.level}
            onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
          >
            {LEVELS.map((v) => (
              <option key={v || "x"} value={v}>{v || "—"}</option>
            ))}
          </select>
        </label>
        <label>
          Gender
          <select
            value={form.gender}
            onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
          >
            {GENDERS.map((v) => (
              <option key={v || "x"} value={v}>{v || "—"}</option>
            ))}
          </select>
        </label>
        <label>
          Game type
          <select
            value={form.gameType}
            onChange={(e) => setForm((f) => ({ ...f, gameType: e.target.value }))}
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
              value={form.quarterDurationMs != null ? form.quarterDurationMs / 60000 : ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, quarterDurationMs: Number(e.target.value) * 60000 }))
              }
            />
          </label>
          <label>
            Break between quarters (minutes)
            <input
              type="number"
              min={0}
              value={form.breakBetweenQuartersDurationMs != null ? form.breakBetweenQuartersDurationMs / 60000 : ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  breakBetweenQuartersDurationMs: Number(e.target.value) * 60000,
                }))
              }
            />
          </label>
          <label>
            Halftime (minutes)
            <input
              type="number"
              min={0}
              value={form.halftimeDurationMs != null ? form.halftimeDurationMs / 60000 : ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, halftimeDurationMs: Number(e.target.value) * 60000 }))
              }
            />
          </label>
        </fieldset>
        <div className="form-actions">
          <button type="submit" className="btn primary">
            Add game
          </button>
          <Link to={`/game-days/${gameDayId}`} className="btn secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
