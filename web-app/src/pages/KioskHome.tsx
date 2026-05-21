import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { ApiErrorDisplay } from "../components/DatabaseUnavailable";

type GameRow = {
  id: string;
  homeTeamName: string;
  awayTeamName: string;
};

export function KioskHome() {
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.games
      .list()
      .then((rows) => {
        setGames(
          (rows as GameRow[]).map((g) => ({
            id: g.id,
            homeTeamName: g.homeTeamName,
            awayTeamName: g.awayTeamName,
          }))
        );
      })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page kiosk-home-page">
        <p>Loading games…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="page kiosk-home-page">
        <ApiErrorDisplay error={error} />
      </div>
    );
  }

  return (
    <div className="page kiosk-home-page">
      <header className="kiosk-home-header">
        <h1>PoloDeck kiosk</h1>
        <p className="kiosk-home-sub">
          New Pis: run the installer below, then assign each device under <strong>Kiosks</strong> in the main app.
          Legacy links below open a fixed game URL without server assignment.
        </p>
        <p className="kiosk-home-install">
          Install a Pi with:{" "}
          <code className="kiosk-home-code">{`curl -fsSL 'http://<LAN-IP>:3000/kb' | sudo bash`}</code>{" "}
          (opens <code className="kiosk-home-code">/kiosk/managed</code>)
        </p>
      </header>
      {games.length === 0 ? (
        <p>No games yet. Create a game day in the main app.</p>
      ) : (
        <table className="table kiosk-home-table">
          <thead>
            <tr>
              <th>Matchup</th>
              <th>Scoreboard</th>
              <th>Shot clock</th>
              <th>Timer</th>
            </tr>
          </thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.id}>
                <td>
                  {g.homeTeamName} vs {g.awayTeamName}
                </td>
                <td>
                  <Link to={`/kiosk/g/${g.id}/display`} className="btn btn-compact">
                    Open
                  </Link>
                </td>
                <td>
                  <Link to={`/kiosk/g/${g.id}/shot-clock`} className="btn btn-compact">
                    Open
                  </Link>
                </td>
                <td>
                  <Link to={`/kiosk/g/${g.id}/timer`} className="btn btn-compact">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
