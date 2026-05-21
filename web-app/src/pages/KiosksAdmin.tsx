import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type KioskDevice, type KioskDeviceType } from "../api/client";
import { ApiErrorDisplay } from "../components/DatabaseUnavailable";

const STALE_AFTER_MS = 180_000;

const DEVICE_TYPES: { value: KioskDeviceType; label: string }[] = [
  { value: "UNASSIGNED", label: "Unassigned" },
  { value: "SCOREBOARD", label: "Scoreboard" },
  { value: "SHOT_CLOCK", label: "Shot clock" },
  { value: "TIMER", label: "Timer" },
];

function isStale(lastCheckInAt: string): boolean {
  return Date.now() - new Date(lastCheckInAt).getTime() > STALE_AFTER_MS;
}

export function KiosksAdmin() {
  const [devices, setDevices] = useState<KioskDevice[]>([]);
  const [games, setGames] = useState<{ id: string; homeTeamName: string; awayTeamName: string }[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [devList, gameList] = await Promise.all([api.devices.list(), api.games.list()]);
    setDevices(devList);
    setGames(gameList);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, [load]);

  const onSave = async (device: KioskDevice, type: KioskDeviceType, gameId: string) => {
    setSavingId(device.id);
    setRowError(null);
    try {
      if (type === "UNASSIGNED") {
        await api.devices.update(device.id, { type: "UNASSIGNED", gameId: null });
      } else {
        if (!gameId) {
          setRowError("Choose a game for this role.");
          return;
        }
        await api.devices.update(device.id, { type, gameId });
      }
      await load();
    } catch (e) {
      setRowError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="page kiosks-admin-page">
        <p>Loading kiosks…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="page kiosks-admin-page">
        <ApiErrorDisplay error={error} />
      </div>
    );
  }

  return (
    <div className="page kiosks-admin-page">
      <header className="kiosks-admin-header">
        <h1 className="kiosks-admin-title">Kiosks</h1>
        <p className="kiosks-admin-sub">
          Devices appear here after they open <code className="kiosks-admin-code">/kiosk/managed</code>. Assign
          a display role and game for each Pi; no typing is required on the device.
        </p>
      </header>

      {rowError ? <p className="kiosks-admin-banner-error">{rowError}</p> : null}

      {devices.length === 0 ? (
        <p className="kiosks-admin-empty">No kiosks yet. Boot a Pi with the PoloDeck installer URL.</p>
      ) : (
        <div className="kiosks-admin-table-wrap">
          <table className="table kiosks-admin-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Device ID (match on screen)</th>
                <th>Role</th>
                <th>Game</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <KioskDeviceRow
                  key={d.id}
                  device={d}
                  games={games}
                  saving={savingId === d.id}
                  onSave={onSave}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KioskDeviceRow({
  device: d,
  games,
  saving,
  onSave,
}: {
  device: KioskDevice;
  games: { id: string; homeTeamName: string; awayTeamName: string }[];
  saving: boolean;
  onSave: (device: KioskDevice, type: KioskDeviceType, gameId: string) => void;
}) {
  const [type, setType] = useState<KioskDeviceType>(d.type);
  const [gameId, setGameId] = useState(d.gameId ?? "");

  /* eslint-disable react-hooks/set-state-in-effect -- sync selects when server row changes */
  useEffect(() => {
    setType(d.type);
    setGameId(d.gameId ?? "");
  }, [d.type, d.gameId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const stale = isStale(d.lastCheckInAt);
  const shortLabel = d.clientId.replace(/-/g, "").slice(-8).toUpperCase();

  return (
    <tr className={stale ? "kiosks-admin-row--stale" : undefined}>
      <td>
        <span className={`kiosks-admin-pill ${stale ? "kiosks-admin-pill--off" : "kiosks-admin-pill--on"}`}>
          {stale ? "Offline" : "Online"}
        </span>
      </td>
      <td>
        <code className="kiosks-admin-code">{shortLabel}</code>
        <span className="kiosks-admin-meta"> · full id in tools if needed</span>
      </td>
      <td>
        <select
          className="kiosks-admin-select"
          value={type}
          onChange={(e) => setType(e.target.value as KioskDeviceType)}
          aria-label="Kiosk role"
        >
          {DEVICE_TYPES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select
          className="kiosks-admin-select"
          value={gameId}
          onChange={(e) => setGameId(e.target.value)}
          disabled={type === "UNASSIGNED"}
          aria-label="Game"
        >
          <option value="">—</option>
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.homeTeamName} vs {g.awayTeamName}
            </option>
          ))}
        </select>
      </td>
      <td>
        <button
          type="button"
          className="btn btn-compact primary"
          disabled={saving}
          onClick={() => onSave(d, type, gameId)}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </td>
    </tr>
  );
}
