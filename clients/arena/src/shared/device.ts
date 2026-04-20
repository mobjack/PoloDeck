import { checkInDevice } from "./api";
import type { DeviceRole } from "./types";

const STORAGE_KEY = "polodeck-arena-client-id";

function getOrCreateClientId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return `anon-${Math.random().toString(36).slice(2)}`;
  }
}

/** Initial check-in + periodic heartbeat via same endpoint (updates lastCheckInAt on server). */
export function startDevicePresence(
  apiBase: string,
  role: DeviceRole,
  options?: { name?: string; heartbeatMs?: number; onServerRole?: (role: DeviceRole) => void }
): () => void {
  const clientId = getOrCreateClientId();
  const heartbeatMs = options?.heartbeatMs ?? 25_000;

  const ping = () => {
    checkInDevice(apiBase, {
      clientId,
      type: role,
      name: options?.name,
    })
      .then((res) => {
        options?.onServerRole?.(res.device.type);
      })
      .catch(() => {
        /* ignore transient failures */
      });
  };

  ping();
  const id = window.setInterval(ping, heartbeatMs);
  return () => clearInterval(id);
}
