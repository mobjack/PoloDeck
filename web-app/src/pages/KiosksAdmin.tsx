import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const devList = await api.devices.list();
    setDevices(devList);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, [load]);

  const onActivate = async (device: KioskDevice, type: KioskDeviceType) => {
    setSavingId(device.id);
    setRowError(null);
    try {
      if (type === "UNASSIGNED") {
        await api.devices.update(device.id, { type: "UNASSIGNED" });
      } else {
        await api.devices.update(device.id, { type });
      }
      await load();
    } catch (e) {
      setRowError(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Activate failed"
      );
    } finally {
      setSavingId(null);
    }
  };

  const onDelete = async (device: KioskDevice) => {
    if (!window.confirm("Remove this kiosk from the list? It can register again when reopened.")) {
      return;
    }
    setDeletingId(device.id);
    setRowError(null);
    try {
      await api.devices.delete(device.id);
      await load();
    } catch (e) {
      setRowError(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Delete failed"
      );
    } finally {
      setDeletingId(null);
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
          Devices appear here after they open <code className="kiosks-admin-code">/kiosk/managed</code>.
          Set the <strong>live game</strong> on the game day page, then choose what each Pi displays
          (scoreboard, shot clock, or timer) and click Activate.
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
                <th />
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <KioskDeviceRow
                  key={d.id}
                  device={d}
                  saving={savingId === d.id}
                  deleting={deletingId === d.id}
                  onActivate={onActivate}
                  onDelete={onDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TimerControllerSection />
    </div>
  );
}

function TimerControllerSection() {
  const timerUrl =
    typeof window !== "undefined" ? `${window.location.origin}/timer` : "/timer";

  return (
    <section className="timer-access-section">
      <h2>Timer Controller</h2>
      <p className="timer-access-hint">
        Run the game clock from a phone or tablet browser — no app install. The timer
        automatically follows whichever game is <strong>live on displays</strong>.
      </p>
      <div className="timer-access-body">
        <div className="timer-access-qr">
          <QRCodeSVG value={timerUrl} size={168} includeMargin marginSize={2} />
        </div>
        <div className="timer-access-text">
          <ol className="timer-access-steps">
            <li>Join the PoloDeck Wi-Fi.</li>
            <li>Scan this QR code.</li>
            <li>Open the timer controller in your browser.</li>
          </ol>
          <a className="timer-access-url" href={timerUrl}>
            {timerUrl}
          </a>
        </div>
      </div>
    </section>
  );
}

function KioskDeviceRow({
  device: d,
  saving,
  deleting,
  onActivate,
  onDelete,
}: {
  device: KioskDevice;
  saving: boolean;
  deleting: boolean;
  onActivate: (device: KioskDevice, type: KioskDeviceType) => void;
  onDelete: (device: KioskDevice) => void;
}) {
  const [type, setType] = useState<KioskDeviceType>(d.type);

  /* eslint-disable react-hooks/set-state-in-effect -- sync selects when server row changes */
  useEffect(() => {
    setType(d.type);
  }, [d.type]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const stale = isStale(d.lastCheckInAt);
  const shortLabel = d.clientId.replace(/-/g, "").slice(-8).toUpperCase();
  const isUnassigned = type === "UNASSIGNED";

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
      <td className="kiosks-admin-actions">
        <button
          type="button"
          className="btn btn-compact primary"
          disabled={saving || deleting}
          onClick={() => onActivate(d, type)}
        >
          {saving ? "…" : isUnassigned ? "Clear assignment" : "Activate"}
        </button>
        <button
          type="button"
          className="btn btn-compact secondary"
          disabled={saving || deleting}
          onClick={() => onDelete(d)}
        >
          {deleting ? "…" : "Delete"}
        </button>
      </td>
    </tr>
  );
}
