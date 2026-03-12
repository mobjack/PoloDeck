import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { GameDay } from "../types/gameDay";

export function GameDayList() {
  const [list, setList] = useState<GameDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.gameDays
      .list()
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading…</p>;
  if (error) return <p className="error">Error: {error}</p>;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Game Days</h1>
        <Link to="/game-days/new" className="btn primary">
          New Game Day
        </Link>
      </header>
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Location</th>
            <th>Games</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr>
              <td colSpan={4}>No game days yet. Create one to get started.</td>
            </tr>
          ) : (
            list.map((gd) => (
              <tr key={gd.id}>
                <td>{gd.date}</td>
                <td>{gd.location}</td>
                <td>{gd.games.length}</td>
                <td>
                  <Link to={`/game-days/${gd.id}`}>View</Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
