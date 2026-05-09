import { useEffect } from "react";
import { api } from "../api/client";

const STORAGE_KEY = "polodeck-kiosk-client-id";

export function getOrCreateKioskClientId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

/** Heartbeat only; device role and game are assigned on the server (see /kiosk/managed). */
export function useKioskDeviceCheckIn() {
  useEffect(() => {
    const clientId = getOrCreateKioskClientId();
    void api.devices.checkIn({ clientId }).catch(() => {
      /* display still works without check-in */
    });
  }, []);
}
