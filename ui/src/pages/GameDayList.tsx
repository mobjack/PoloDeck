import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type DeviceCapabilities } from "../api/client";
import type { GameDay } from "../types/gameDay";
import { ApiErrorDisplay } from "../components/DatabaseUnavailable";

export function GameDayList() {
  const [list, setList] = useState<GameDay[]>([]);
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([api.gameDays.list(), api.capabilities()])
      .then(([gameDays, caps]) => {
        setList(gameDays);
        setCapabilities(caps);
      })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading…</p>;
  if (error) return <ApiErrorDisplay error={error} />;

  return (
    <div className="page page--home">
      <header className="page-header page-header--client-status">
        <h1>Water Polo Deck Manager - Game Days</h1>
        <p className="welcome-line">Welcome to Water Polo Deck Manager.</p>
        <div className="client-status-line">
          <span className="client-status-item" title={capabilities?.hasScoreboard ? "Scoreboard connected" : "Scoreboard not connected"}>
            Scoreboard <span className={`client-dot ${capabilities?.hasScoreboard ? "client-dot-on" : "client-dot-off"}`} aria-hidden />
          </span>
          <span className="client-status-item" title={capabilities?.hasTimer ? "Timer connected" : "Timer not connected"}>
            Timer <span className={`client-dot ${capabilities?.hasTimer ? "client-dot-on" : "client-dot-off"}`} aria-hidden />
          </span>
          <span className="client-status-item" title={capabilities?.hasShotClock ? `${capabilities.shotClockCount} shot clock(s) connected` : "Shot clocks not connected"}>
            Shot clocks{capabilities?.hasShotClock && capabilities.shotClockCount > 1 ? ` (${capabilities.shotClockCount})` : ""}{" "}
            <span className={`client-dot ${capabilities?.hasShotClock ? "client-dot-on" : "client-dot-off"}`} aria-hidden />
          </span>
        </div>
      </header>
      <div className="home-layout">
        <main className="home-main">
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
          <Link to="/game-days/new" className="btn primary">
            New Game Day
          </Link>
        </main>
        <aside className="home-sidebar">
          <h2 className="user-guide-title">User guide</h2>
          <ul className="user-guide-list">
            <li>Create a <strong>game day</strong> (date and location) with the button below.</li>
            <li>Open a day to <strong>add games</strong>, set timing, and edit rosters.</li>
            <li>Use <strong>Roster</strong> on each game to enter or import player names by cap number.</li>
            <li>Connect <strong>scoreboard</strong>, <strong>timer</strong>, and <strong>shot clock</strong> clients to the server; status appears above.</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
