import { useEffect } from "react";
import { api } from "../api/client";

const STORAGE_KEY = "polodeck-kiosk-client-id";

/**
 * UUID v4 that also works in non-secure contexts (plain HTTP on a LAN IP), where
 * `crypto.randomUUID` is unavailable. `crypto.getRandomValues` is allowed in such
 * contexts; fall back to Math.random only if even that is missing.
 */
function generateClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      /* fall through to getRandomValues */
    }
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `cid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateKioskClientId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = generateClientId();
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
