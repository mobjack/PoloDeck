import { existsSync } from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { env } from "../config/env";

/**
 * Serve the built React SPA when POLODECK_WEB_ROOT is set (native packaging).
 * API, Socket.IO, /health, and /kb remain registered on the same server.
 */
export const webStaticPlugin = fp(async (app: FastifyInstance) => {
  const root = env.POLODECK_WEB_ROOT;
  if (!root) return;

  if (!existsSync(root)) {
    app.log.warn({ root }, "POLODECK_WEB_ROOT does not exist; static UI disabled");
    return;
  }

  await app.register(fastifyStatic, {
    root: path.resolve(root),
    prefix: "/",
    wildcard: false,
  });

  // SPA fallback for client-side routes (skip API / health / socket / kb)
  app.setNotFoundHandler((request, reply) => {
    const url = request.url.split("?")[0] ?? "";
    if (
      url.startsWith("/api") ||
      url.startsWith("/socket.io") ||
      url.startsWith("/health") ||
      url === "/kb" ||
      url.startsWith("/kb?")
    ) {
      return reply.status(404).send({ message: "Not Found" });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return reply.status(404).send({ message: "Not Found" });
    }
    return reply.sendFile("index.html");
  });
});
