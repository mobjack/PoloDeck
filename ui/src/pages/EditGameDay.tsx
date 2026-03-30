import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, isDatabaseUnavailableError } from "../api/client";
import type { GameDay, UpdateGameDayInput } from "../types/gameDay";
import {
  ApiErrorDisplay,
  DatabaseUnavailable,
  formatApiErrorMessage,
} from "../components/DatabaseUnavailable";

export function EditGameDay() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [gameDay, setGameDay] = useState<GameDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
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
        });
      })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setError(null);
    api.gameDays
      .update(id, form)
      .then(() => navigate(`/game-days/${id}`))
      .catch((e) => setError(e));
  };

  if (loading) return <p>Loading…</p>;
  if (error && !gameDay) return <ApiErrorDisplay error={error} />;
  if (!gameDay) return <p>Game day not found.</p>;

  if (isDatabaseUnavailableError(error)) {
    return <DatabaseUnavailable />;
  }

  return (
    <div className="page">
      <header className="page-header">
        <Link to={`/game-days/${id}`}>← Back to game day</Link>
        <h1>Edit game day</h1>
      </header>

      <form onSubmit={handleSubmit} className="form">
        {error != null ? (
          <p className="error">{formatApiErrorMessage(error)}</p>
        ) : null}
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
