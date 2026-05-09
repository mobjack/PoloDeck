import { io, type Socket } from "socket.io-client";

/** Same-origin when `VITE_SOCKET_URL` is unset (nginx proxies `/socket.io/`). */
export function createGameSocket(): Socket {
  const raw = import.meta.env.VITE_SOCKET_URL;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return io(raw.trim(), { transports: ["websocket"] });
  }
  return io({ transports: ["websocket"] });
}
