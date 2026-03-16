import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { GameDay, GameOnDay } from "../types/gameDay";

type TeamSide = "HOME" | "AWAY";

interface Player {
  id: string;
  gameId: string;
  teamSide: TeamSide;
  capNumber: string;
  playerName: string;
}

const CAP_NUMBERS: string[] = [
  "1",
  "1A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
];

export function GameRoster() {
  const { id: gameDayId, gameId } = useParams<{ id: string; gameId: string }>();
  const navigate = useNavigate();
  const [gameDay, setGameDay] = useState<GameDay | null>(null);
  const [allGameDays, setAllGameDays] = useState<GameDay[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [homeNames, setHomeNames] = useState<Record<string, string>>({});
  const [awayNames, setAwayNames] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [importGameId, setImportGameId] = useState<string>("");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importSourceSide, setImportSourceSide] = useState<TeamSide | null>(null);
  const [importApplyHome, setImportApplyHome] = useState(true);
  const [importApplyAway, setImportApplyAway] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [quickFillSide, setQuickFillSide] = useState<TeamSide | null>(null);
  const [quickFillCount, setQuickFillCount] = useState<string>("12");
  const [quickFillError, setQuickFillError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameDayId || !gameId) return;
    setLoading(true);
    Promise.all([api.gameDays.get(gameDayId), api.gameDays.list(), api.games.getRoster(gameId)])
      .then(([gd, all, players]) => {
        setGameDay(gd);
        setAllGameDays(all);
        const home: Record<string, string> = {};
        const away: Record<string, string> = {};
        for (const cap of CAP_NUMBERS) {
          home[cap] = "";
          away[cap] = "";
        }
        for (const p of players as Player[]) {
          if (!CAP_NUMBERS.includes(p.capNumber)) continue;
          if (p.teamSide === "HOME") {
            home[p.capNumber] = p.playerName;
          } else if (p.teamSide === "AWAY") {
            away[p.capNumber] = p.playerName;
          }
        }
        setHomeNames(home);
        setAwayNames(away);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [gameDayId, gameId]);

  const thisGame: GameOnDay | null = useMemo(() => {
    if (!gameDay || !gameId) return null;
    return gameDay.games.find((g) => g.id === gameId) ?? null;
  }, [gameDay, gameId]);

  const importOptions = useMemo(() => {
    if (!allGameDays || !gameId) return [];
    const options: { gameId: string; label: string }[] = [];
    for (const gd of allGameDays) {
      for (const g of gd.games) {
        if (g.id === gameId) continue;
        options.push({
          gameId: g.id,
          label: `${gd.date} — ${gd.location}: ${g.homeTeamName} vs ${g.awayTeamName}`,
        });
      }
    }
    return options;
  }, [allGameDays, gameId]);

  const selectedImportGame = useMemo(() => {
    if (!allGameDays || !importGameId) return null;
    for (const gd of allGameDays) {
      const g = gd.games.find((x) => x.id === importGameId);
      if (g) {
        return { gameDay: gd, game: g };
      }
    }
    return null;
  }, [allGameDays, importGameId]);

  const buildRosterPayload = () => {
    const home = CAP_NUMBERS.map((cap) => ({
      capNumber: cap,
      playerName: homeNames[cap]?.trim() ?? "",
    })).filter((p) => p.playerName.length > 0);
    const away = CAP_NUMBERS.map((cap) => ({
      capNumber: cap,
      playerName: awayNames[cap]?.trim() ?? "",
    })).filter((p) => p.playerName.length > 0);
    return { home, away };
  };

  const handleSave = async () => {
    if (!gameId) return;
    setSaving(true);
    setError(null);
    try {
      const { home, away } = buildRosterPayload();
      await api.games.replaceRoster(gameId, { home, away });
      if (gameDayId) {
        navigate(`/game-days/${gameDayId}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndGoToSheet = async () => {
    if (!gameId || !gameDayId) return;
    setSaving(true);
    setError(null);
    try {
      const { home, away } = buildRosterPayload();
      await api.games.replaceRoster(gameId, { home, away });
      navigate(`/game-days/${gameDayId}/games/${gameId}/sheet`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (gameDayId) {
      navigate(`/game-days/${gameDayId}`);
    } else {
      navigate("/");
    }
  };

  const openImportModal = () => {
    if (!importGameId) return;
    setImportSourceSide(null);
    setImportApplyHome(true);
    setImportApplyAway(false);
    setImportError(null);
    setIsImportModalOpen(true);
  };

  const handleConfirmImport = async () => {
    if (!importGameId || !importSourceSide || !selectedImportGame) {
      setImportError("Select a source game and team.");
      return;
    }
    if (!importApplyHome && !importApplyAway) {
      setImportError("Choose at least one team to apply to.");
      return;
    }
    try {
      const players = await api.games.getRoster(importGameId);
      const fromSide = players.filter((p) => p.teamSide === importSourceSide);
      const byCap = new Map<string, string>();
      for (const p of fromSide) {
        if (!CAP_NUMBERS.includes(p.capNumber)) continue;
        if (!byCap.has(p.capNumber)) {
          byCap.set(p.capNumber, p.playerName);
        }
      }
      if (importApplyHome) {
        setHomeNames((prev) => {
          const next = { ...prev };
          for (const cap of CAP_NUMBERS) {
            const name = byCap.get(cap);
            if (name) next[cap] = name;
          }
          return next;
        });
      }
      if (importApplyAway) {
        setAwayNames((prev) => {
          const next = { ...prev };
          for (const cap of CAP_NUMBERS) {
            const name = byCap.get(cap);
            if (name) next[cap] = name;
          }
          return next;
        });
      }
      setIsImportModalOpen(false);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    }
  };

  const openQuickFillModal = (side: TeamSide) => {
    setQuickFillSide(side);
    setQuickFillCount("12");
    setQuickFillError(null);
  };

  const applyQuickFillForSide = (side: TeamSide, count: number) => {
    const names = side === "HOME" ? homeNames : awayNames;
    const emptyCaps = CAP_NUMBERS.filter((cap) => (names[cap] ?? "").trim().length === 0);
    if (emptyCaps.length === 0 || count <= 0) return;

    const requested = Math.min(count, emptyCaps.length);

    // Find max existing "Player N" index on this side
    let maxIndex = 0;
    for (const name of Object.values(names)) {
      const match = /^Player\s+(\d+)$/.exec(name.trim());
      if (match) {
        const num = parseInt(match[1], 10);
        if (!Number.isNaN(num) && num > maxIndex) {
          maxIndex = num;
        }
      }
    }

    const updated: Record<string, string> = { ...names };
    for (let i = 0; i < requested; i++) {
      const cap = emptyCaps[i];
      const index = maxIndex + i + 1;
      updated[cap] = `Player ${index}`;
    }

    if (side === "HOME") {
      setHomeNames(updated);
    } else {
      setAwayNames(updated);
    }
  };

  const handleConfirmQuickFill = () => {
    if (!quickFillSide) return;
    const n = parseInt(quickFillCount, 10);
    if (Number.isNaN(n) || n <= 0) {
      setQuickFillError("Enter a positive number of caps.");
      return;
    }
    applyQuickFillForSide(quickFillSide, n);
    setQuickFillSide(null);
  };

  const clearSide = (side: TeamSide) => {
    const empty: Record<string, string> = {};
    for (const cap of CAP_NUMBERS) {
      empty[cap] = "";
    }
    if (side === "HOME") {
      setHomeNames(empty);
    } else {
      setAwayNames(empty);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <p>Loading…</p>
      </div>
    );
  }

  if (error || !gameDay || !thisGame) {
    return (
      <div className="page">
        {error ? <p className="error">Error: {error}</p> : <p>Game not found.</p>}
        <button type="button" className="btn secondary" onClick={handleCancel}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="page roster-page">
      <header className="page-header">
        <Link to={gameDayId ? `/game-days/${gameDayId}` : "/"}>← Back to games</Link>
        <h1>Game roster for {gameDay.date} @ {gameDay.location.toUpperCase()}</h1>
      </header>

      <h3 className="roster-heading-matchup">
        Editing roster for:{" "}
        <span className="roster-home-label">{thisGame.homeTeamName}</span>
        {" vs "}
        <span className="roster-away-label">{thisGame.awayTeamName}</span>
      </h3>

      <div className="roster-import">
        <label>
          Import roster from another day:
          <select
            value={importGameId}
            onChange={(e) => setImportGameId(e.target.value)}
          >
            <option value="">Select game…</option>
            {importOptions.map((opt) => (
              <option key={opt.gameId} value={opt.gameId}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn secondary btn-compact"
          onClick={openImportModal}
          disabled={!importGameId}
        >
          Import
        </button>
      </div>

      <div className="roster-table-top-actions">
        {gameDayId && gameId && (
          <button
            type="button"
            className="btn primary btn-compact game-sheet-button"
            onClick={handleSaveAndGoToSheet}
            disabled={saving}
          >
            Game sheet
          </button>
        )}
        <button
          type="button"
          className="btn primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="roster-table-wrapper">
        <table className="roster-table">
          <thead>
            <tr>
              <th className="roster-cap-heading">Cap</th>
              <th className="roster-home-heading">
                Home (dark) <span className="roster-home-label">{thisGame.homeTeamName}</span>
                <button
                  type="button"
                  className="btn secondary btn-compact roster-quick-fill-button"
                  onClick={() => openQuickFillModal("HOME")}
                >
                  Quick fill caps
                </button>
                <button
                  type="button"
                  className="btn secondary btn-compact roster-quick-fill-button"
                  onClick={() => {
                    if (window.confirm("Clear all Home (dark) player names?")) {
                      clearSide("HOME");
                    }
                  }}
                >
                  Clear
                </button>
              </th>
              <th className="roster-cap-heading">Cap</th>
              <th className="roster-away-heading">
                Away (light) <span className="roster-away-label">{thisGame.awayTeamName}</span>
                <button
                  type="button"
                  className="btn secondary btn-compact roster-quick-fill-button"
                  onClick={() => openQuickFillModal("AWAY")}
                >
                  Quick fill caps
                </button>
                <button
                  type="button"
                  className="btn secondary btn-compact roster-quick-fill-button"
                  onClick={() => {
                    if (window.confirm("Clear all Away (light) player names?")) {
                      clearSide("AWAY");
                    }
                  }}
                >
                  Clear
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {CAP_NUMBERS.map((cap, index) => (
              <tr key={cap}>
                <td>{cap}</td>
                <td>
                  <input
                    type="text"
                    tabIndex={index + 1}
                    value={homeNames[cap] ?? ""}
                    onChange={(e) =>
                      setHomeNames((prev) => ({ ...prev, [cap]: e.target.value }))
                    }
                  />
                </td>
                <td>{cap}</td>
                <td>
                  <input
                    type="text"
                    tabIndex={CAP_NUMBERS.length + index + 1}
                    value={awayNames[cap] ?? ""}
                    onChange={(e) =>
                      setAwayNames((prev) => ({ ...prev, [cap]: e.target.value }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        <button
          type="button"
          className="btn secondary"
          onClick={handleCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save roster"}
        </button>
      </div>

      {isImportModalOpen && selectedImportGame && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Import roster</h3>
            <p className="modal-section-title">From:</p>
            <p className="modal-text">
              {selectedImportGame.gameDay.date} — {selectedImportGame.game.homeTeamName} vs{" "}
              {selectedImportGame.game.awayTeamName}
            </p>
            <p className="modal-section-title">To:</p>
            <p className="modal-text">
              {gameDay.date} — {thisGame.homeTeamName} vs {thisGame.awayTeamName}
            </p>

            <div className="modal-section">
              <p className="modal-section-title">Which team’s roster to copy?</p>
              <label className="modal-radio">
                <input
                  type="radio"
                  name="import-source-team"
                  value="HOME"
                  checked={importSourceSide === "HOME"}
                  onChange={() => setImportSourceSide("HOME")}
                />
                Home (dark) from {selectedImportGame.gameDay.date}:{" "}
                {selectedImportGame.game.homeTeamName}
              </label>
              <label className="modal-radio">
                <input
                  type="radio"
                  name="import-source-team"
                  value="AWAY"
                  checked={importSourceSide === "AWAY"}
                  onChange={() => setImportSourceSide("AWAY")}
                />
                Away (light) from {selectedImportGame.gameDay.date}:{" "}
                {selectedImportGame.game.awayTeamName}
              </label>
            </div>

            <div className="modal-section">
              <p className="modal-section-title">Apply to:</p>
              <label className="modal-checkbox">
                <input
                  type="checkbox"
                  checked={importApplyHome}
                  onChange={(e) => setImportApplyHome(e.target.checked)}
                />
                Home (dark) on {gameDay.date}: {thisGame.homeTeamName}
              </label>
              <label className="modal-checkbox">
                <input
                  type="checkbox"
                  checked={importApplyAway}
                  onChange={(e) => setImportApplyAway(e.target.checked)}
                />
                Away (light) on {gameDay.date}: {thisGame.awayTeamName}
              </label>
            </div>

            <p className="modal-warning">
              This will overwrite the roster fields for the selected team(s) when you save.
            </p>

            {importError && <p className="error">{importError}</p>}

            <div className="form-actions modal-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setIsImportModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={handleConfirmImport}
              >
                Import roster
              </button>
            </div>
          </div>
        </div>
      )}
      {quickFillSide && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Quick fill caps</h3>
            <p className="modal-text">
              Fill empty caps for{" "}
              {quickFillSide === "HOME"
                ? `Home (dark): ${thisGame.homeTeamName}`
                : `Away (light): ${thisGame.awayTeamName}`}
              .
            </p>

            <div className="modal-section">
              <p className="modal-section-title">How many caps to fill?</p>
              <input
                type="number"
                min={1}
                max={CAP_NUMBERS.length}
                value={quickFillCount}
                onChange={(e) => setQuickFillCount(e.target.value)}
              />
            </div>

            {quickFillError && <p className="error">{quickFillError}</p>}

            <p className="modal-warning">
              This will only fill currently empty caps with placeholder names like{" "}
              <strong>Player 1</strong>, <strong>Player 2</strong>, etc. You can edit them at any
              time.
            </p>

            <div className="form-actions modal-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setQuickFillSide(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={handleConfirmQuickFill}
              >
                Quick fill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

