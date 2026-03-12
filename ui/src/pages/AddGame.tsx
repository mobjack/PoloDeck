import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { CreateGameInput } from "../types/gameDay";

const LEVELS = ["Varsity", "JV", "14U", "16U", "18U", ""];
const GENDERS = ["Boys", "Girls", "Co-ed", ""];
const GAME_TYPES = ["League", "Tournament", "Scrimmage", "Practice", ""];

export function AddGame() {
  const { id: gameDayId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CreateGameInput>({
    gameDayId: gameDayId ?? undefined,
    homeTeamName: "",
    awayTeamName: "",
    level: "",
    gender: "",
    gameType: "",
    label: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const body: CreateGameInput = {
      ...form,
      gameDayId: gameDayId ?? undefined,
      level: form.level || undefined,
      gender: form.gender || undefined,
      gameType: form.gameType || undefined,
      label: form.label || undefined,
    };
    api.games
      .create(body)
      .then(() => navigate(`/game-days/${gameDayId}`))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <div className="page">
      <header className="page-header">
        <Link to={`/game-days/${gameDayId}`}>← Back to game day</Link>
        <h1>Add game</h1>
      </header>

      <form onSubmit={handleSubmit} className="form">
        {error && <p className="error">{error}</p>}
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
        <label>
          Label (e.g. Girls Varsity 7pm)
          <input
            type="text"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          />
        </label>
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
