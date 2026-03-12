import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { UpdateGameInput } from "../types/gameDay";

const LEVELS = ["Varsity", "JV", "14U", "16U", "18U", ""];
const GENDERS = ["Boys", "Girls", "Co-ed", ""];
const GAME_TYPES = ["League", "Tournament", "Scrimmage", "Practice", ""];

export function EditGame() {
  const { id: gameDayId, gameId } = useParams<{ id: string; gameId: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
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
            label: game.label,
          });
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
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
      label: form.label || null,
    };
    api.games
      .update(gameId, body)
      .then(() => navigate(`/game-days/${gameDayId}`))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <div className="page">
      <header className="page-header">
        <Link to={`/game-days/${gameDayId}`}>← Back to game day</Link>
        <h1>Edit game</h1>
      </header>

      <form onSubmit={handleSubmit} className="form">
        {error && <p className="error">{error}</p>}
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
        <label>
          Label
          <input
            type="text"
            value={form.label ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value || null }))}
          />
        </label>
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
