import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, isDatabaseUnavailableError } from "../api/client";
import {
  DatabaseUnavailable,
  formatApiErrorMessage,
} from "../components/DatabaseUnavailable";
import type { CreateGameDayInput } from "../types/gameDay";

const DEFAULT_QUARTER_MS = 8 * 60 * 1000;
const DEFAULT_BREAK_MS = 30 * 1000;
const DEFAULT_HALFTIME_MS = 3 * 60 * 1000;

export function NewGameDay() {
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);
  const [form, setForm] = useState<CreateGameDayInput>({
    date: new Date().toISOString().slice(0, 10),
    location: "",
    defaultQuarterDurationMs: DEFAULT_QUARTER_MS,
    defaultBreakBetweenQuartersMs: DEFAULT_BREAK_MS,
    defaultHalftimeDurationMs: DEFAULT_HALFTIME_MS,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    api.gameDays
      .create(form)
      .then((r) => navigate(`/game-days/${r.id}`))
      .catch((e) => setError(e));
  };

  const setMinutes = (key: keyof CreateGameDayInput, minutes: number) =>
    setForm((f) => ({ ...f, [key]: minutes * 60 * 1000 }));

  if (isDatabaseUnavailableError(error)) {
    return <DatabaseUnavailable />;
  }

  return (
    <div className="page">
      <header className="page-header">
        <Link to="/">← Game Days</Link>
        <h1>New Game Day</h1>
      </header>

      <form onSubmit={handleSubmit} className="form">
        {error && <p className="error">{formatApiErrorMessage(error)}</p>}
        <label>
          Date
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            required
          />
        </label>
        <label>
          Location
          <input
            type="text"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            placeholder="Pool name or address"
            required
          />
        </label>
        <fieldset>
          <legend>Timing defaults</legend>
          <label>
            Quarter length (minutes)
            <input
              type="number"
              min={1}
              value={form.defaultQuarterDurationMs / 60000}
              onChange={(e) => setMinutes("defaultQuarterDurationMs", Number(e.target.value))}
            />
          </label>
          <label>
            Break between quarters (minutes)
            <input
              type="number"
              min={0}
              value={form.defaultBreakBetweenQuartersMs / 60000}
              onChange={(e) => setMinutes("defaultBreakBetweenQuartersMs", Number(e.target.value))}
            />
          </label>
          <label>
            Halftime (minutes)
            <input
              type="number"
              min={0}
              value={form.defaultHalftimeDurationMs / 60000}
              onChange={(e) => setMinutes("defaultHalftimeDurationMs", Number(e.target.value))}
            />
          </label>
        </fieldset>
        <div className="form-actions">
          <button type="submit" className="btn primary">
            Create game day
          </button>
          <Link to="/" className="btn secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
