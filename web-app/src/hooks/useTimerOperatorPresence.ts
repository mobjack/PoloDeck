import { useEffect } from "react";
import { api } from "../api/client";
import { getOrCreateKioskClientId } from "./useKioskDeviceCheckIn";

/** Keep heartbeating well inside the server's stale window. */
const FALLBACK_INTERVAL_MS = 30_000;

/**
 * While the mobile timer controller is open, register this browser as a live TIMER
 * device (self-assigned) and heartbeat so the "Timer connected" status shows green.
 * When the page closes, heartbeats stop and the device goes stale on its own.
 */
export function useTimerOperatorPresence(enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return;
    const clientId = getOrCreateKioskClientId();
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const loop = async () => {
      if (cancelled) return;
      let nextMs = FALLBACK_INTERVAL_MS;
      try {
        const res = await api.devices.checkIn({ clientId, role: "TIMER" });
        if (cancelled) return;
        // Heartbeat at a fraction of the heartbeat interval to stay comfortably fresh.
        nextMs = Math.min(FALLBACK_INTERVAL_MS, res.config.heartbeatIntervalMs);
      } catch {
        nextMs = FALLBACK_INTERVAL_MS;
      }
      if (cancelled) return;
      timeoutId = setTimeout(loop, nextMs);
    };

    void loop();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [enabled]);
}
