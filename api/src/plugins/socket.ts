import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { Server as IOServer } from "socket.io";
import type { TypedIOServer, TypedSocket } from "../types/socket";

declare module "fastify" {
  interface FastifyInstance {
    io: TypedIOServer;
  }
}

const socketPlugin = fp(async (fastify: FastifyInstance) => {
  const server = fastify.server;

  const io: TypedIOServer = new IOServer(server, {
    cors: {
      origin: "*",
    },
  });

  fastify.decorate("io", io);

  io.on("connection", (socket: TypedSocket) => {
    socket.on("game:join", ({ gameId }) => {
      socket.join(`game:${gameId}`);
      socket.data.gameId = gameId;
    });

    socket.on("game:leave", ({ gameId }) => {
      socket.leave(`game:${gameId}`);
      if (socket.data.gameId === gameId) {
        socket.data.gameId = undefined;
      }
    });
  });

  fastify.addHook("onClose", async () => {
    io.close();
  });
});

export default socketPlugin;

