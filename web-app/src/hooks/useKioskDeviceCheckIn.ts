import { useEffect } from "react";
import { api } from "../api/client";

const STORAGE_KEY = "polodeck-kiosk-client-id";

function getOrCreateClientId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

export function useKioskDeviceCheckIn(type: "SCOREBOARD" | "SHOT_CLOCK" | "TIMER") {
  useEffect(() => {
    const clientId = getOrCreateClientId();
    void api.devices
      .checkIn({ clientId, type, name: `kiosk-${type.toLowerCase()}` })
      .catch(() => {
        /* display still works without check-in */
      });
  }, [type]);
}
