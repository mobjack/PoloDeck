import type { Server as HttpServer } from "http";
import type { Server as IOServer, Socket } from "socket.io";

export interface ServerToClientEvents {
  "game:stateUpdated": (payload: { gameId: string; aggregate: any }) => void;
  "game:hornTriggered": (payload: { gameId: string; reason?: string }) => void;
}

export interface ClientToServerEvents {
  "game:join": (payload: { gameId: string }) => void;
  "game:leave": (payload: { gameId: string }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  gameId?: string;
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

