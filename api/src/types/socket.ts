import type { Server as HttpServer } from "http";
import type { Server as IOServer, Socket } from "socket.io";

import type { DeviceSummary } from "../services/deviceCapabilities";

export interface ActiveGameSummary {
  gameId: string;
  homeTeamName: string;
  awayTeamName: string;
}

export interface ServerToClientEvents {
  "game:stateUpdated": (payload: { gameId: string; aggregate: any }) => void;
  "game:hornTriggered": (payload: { gameId: string; reason?: string }) => void;
  "device:updated": (payload: { device: DeviceSummary }) => void;
  "active-game:changed": (payload: { activeGame: ActiveGameSummary | null }) => void;
}

export interface ClientToServerEvents {
  "game:join": (payload: { gameId: string }) => void;
  "game:leave": (payload: { gameId: string }) => void;
  "device:register": (payload: { clientId: string }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  gameId?: string;
  clientId?: string;
}

export type TypedIOServer = IOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export interface SocketWithServer extends HttpServer {
  io?: TypedIOServer;
}

