import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { GameDay, UpdateGameDayInput } from "../types/gameDay";

export function EditGameDay() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [gameDay, setGameDay] = useState<GameDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<UpdateGameDayInput>({});

  useEffect(() => {
    if (!id) return;
    api.gameDays
      .get(id)
      .then((gd) => {
        setGameDay(gd);
        setForm({
          date: gd.date,
          location: gd.location,
          defaultQuarterDurationMs: gd.defaultQuarterDurationMs,
          defaultBreakBetweenQuartersMs: gd.defaultBreakBetweenQuartersMs,
          defaultHalftimeDurationMs: gd.defaultHalftimeDurationMs,
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setError(null);
    api.gameDays
      .update(id, form)
      .then(() => navigate(`/game-days/${id}`))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const setMinutes = (key: keyof UpdateGameDayInput, minutes: number) =>
    setForm((f) => ({ ...f, [key]: minutes * 60 * 1000 }));

  if (loading) return <p>Loading…</p>;
  if (error && !gameDay) return <p className="error">Error: {error}</p>;
  if (!gameDay) return <p>Game day not found.</p>;

  return (
    <div className="page">
      <header className="page-header">
        <Link to={`/game-days/${id}`}>← Back to game day</Link>
        <h1>Edit game day</h1>
      </header>

      <form onSubmit={handleSubmit} className="form">
        {error && <p className="error">{error}</p>}
        <label>
          Date
          <input
            type="date"
            value={form.date ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            required
          />
        </label>
        <label>
          Location
          <input
            type="text"
            value={form.location ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
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
              value={form.defaultQuarterDurationMs != null ? form.defaultQuarterDurationMs / 60000 : ""}
              onChange={(e) => setMinutes("defaultQuarterDurationMs", Number(e.target.value))}
            />
          </label>
          <label>
            Break between quarters (minutes)
            <input
              type="number"
              min={0}
              value={form.defaultBreakBetweenQuartersMs != null ? form.defaultBreakBetweenQuartersMs / 60000 : ""}
              onChange={(e) => setMinutes("defaultBreakBetweenQuartersMs", Number(e.target.value))}
            />
          </label>
          <label>
            Halftime (minutes)
            <input
              type="number"
              min={0}
              value={form.defaultHalftimeDurationMs != null ? form.defaultHalftimeDurationMs / 60000 : ""}
              onChange={(e) => setMinutes("defaultHalftimeDurationMs", Number(e.target.value))}
            />
          </label>
        </fieldset>
        <div className="form-actions">
          <button type="submit" className="btn primary">
            Save
          </button>
          <Link to={`/game-days/${id}`} className="btn secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
