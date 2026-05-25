import { useCallback, useEffect, useState } from "react";
import { api, type KioskDevice } from "../api/client";
import { ApiErrorDisplay } from "../components/DatabaseUnavailable";
import { getOrCreateKioskClientId } from "../hooks/useKioskDeviceCheckIn";
import { useKioskAssignmentSocket } from "../hooks/useKioskAssignmentSocket";
import { KioskScoreboardDisplay } from "./KioskScoreboardDisplay";
import { KioskShotClockDisplay } from "./KioskShotClockDisplay";
import { KioskTimerDisplay } from "./KioskTimerDisplay";

function shortDeviceLabel(clientId: string): string {
  const compact = clientId.replace(/-/g, "");
  return compact.slice(-8).toUpperCase();
}

function isReadyForDisplay(d: KioskDevice): boolean {
  if (d.type === "UNASSIGNED") return false;
  return Boolean(d.gameId);
}

/** Poll often while assigned; retry quickly when server was down. */
const ASSIGNED_POLL_MS = 3_000;
const ERROR_POLL_MS = 3_000;

export function KioskManaged() {
  const [device, setDevice] = useState<KioskDevice | null>(null);
  const [error, setError] = useState<unknown>(null);

  const applyDevice = useCallback((d: KioskDevice) => {
    setDevice(d);
    setError(null);
  }, []);

  useKioskAssignmentSocket(applyDevice);

  useEffect(() => {
    const clientId = getOrCreateKioskClientId();
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const loop = async () => {
      if (cancelled) return;
      let nextMs = 15_000;
      try {
        const res = await api.devices.checkIn({ clientId });
        if (cancelled) return;
        applyDevice(res.device);
        const assigned =
          res.device.type !== "UNASSIGNED" && Boolean(res.device.gameId);
        nextMs = assigned
          ? Math.min(ASSIGNED_POLL_MS, res.config.heartbeatIntervalMs)
          : res.config.heartbeatIntervalMs;
      } catch (e) {
        if (!cancelled) setError(e);
        nextMs = ERROR_POLL_MS;
      }
      if (cancelled) return;
      timeoutId = window.setTimeout(loop, nextMs);
    };

    void loop();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  if (error && !device) {
    return (
      <div className="page kiosk-display-page kiosk-managed-waiting">
        <ApiErrorDisplay error={error} />
      </div>
    );
  }

  if (device && isReadyForDisplay(device) && device.gameId) {
    const gid = device.gameId;
    if (device.type === "SCOREBOARD") {
      return <KioskScoreboardDisplay key={gid} gameId={gid} />;
    }
    if (device.type === "SHOT_CLOCK") {
      return <KioskShotClockDisplay key={gid} gameId={gid} />;
    }
    if (device.type === "TIMER") {
      return <KioskTimerDisplay key={gid} gameId={gid} />;
    }
  }

  const label = device ? shortDeviceLabel(device.clientId) : "…";

  return (
    <div className="page kiosk-display-page kiosk-managed-waiting">
      <header className="kiosk-managed-waiting-header">
        <h1 className="kiosk-managed-waiting-title">Waiting for assignment</h1>
        <p className="kiosk-managed-waiting-sub">
          This kiosk is connected. On the game day page, choose which game is{" "}
          <strong>live on displays</strong>, then open <strong>Manage kiosks</strong> (monitor icon in
          the header) and <strong>Activate</strong> this device with a display role.
        </p>
        <p className="kiosk-managed-device-id" aria-label="Device identifier for matching in admin">
          <span className="kiosk-managed-device-id-label">Device ID</span>
          <span className="kiosk-managed-device-id-value">{label}</span>
        </p>
        {error ? (
          <div className="kiosk-managed-waiting-error">
            <ApiErrorDisplay error={error} />
          </div>
        ) : null}
      </header>
    </div>
  );
}
