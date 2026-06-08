import { io, type Socket } from "socket.io-client";

/** Same-origin when `VITE_SOCKET_URL` is unset (nginx proxies `/socket.io/`). */
export function createGameSocket(): Socket {
  const opts = {
    transports: ["websocket", "polling"] as ("websocket" | "polling")[],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  };
  const raw = import.meta.env.VITE_SOCKET_URL;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return io(raw.trim(), opts);
  }
  // In dev the Vite server (:5173) has no Socket.IO server, so connect to the
  // API at the same host on :3000. Production is served same-origin (nginx
  // proxies /socket.io/) and falls through to the default same-origin io().
  if (import.meta.env.DEV && typeof window !== "undefined" && window.location.hostname) {
    return io(`${window.location.protocol}//${window.location.hostname}:3000`, opts);
  }
  return io(opts);
}
