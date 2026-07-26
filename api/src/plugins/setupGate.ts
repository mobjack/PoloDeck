import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { env } from "../config/env";
import { isPublicApiPath } from "./auth";

/**
 * When POLODECK_REQUIRE_SETUP is set and setup is incomplete, block mutating
 * /api routes except setup/auth/public kiosk paths.
 */
export const setupGatePlugin = fp(async (app: FastifyInstance) => {
  app.addHook("onRequest", async (request, reply) => {
    if (!env.POLODECK_REQUIRE_SETUP) return;

    const url = request.url;
    if (!url.startsWith("/api")) return;

    const method = request.method.toUpperCase();
    const path = url.split("?")[0] ?? url;

    if (isPublicApiPath(method, path)) return;
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

    const settings = await app.prisma.installSettings.findUnique({
      where: { id: "default" },
    });
    if (settings?.setupComplete) return;

    return reply.status(503).send({
      code: "SETUP_REQUIRED",
      message: "Finish the PoloDeck setup wizard before using this feature.",
    });
  });
});

/**
 * When at least one user exists, require auth for non-public mutating API routes
 * and for non-public GET admin routes (game-days list is admin UI).
 */
export const authGatePlugin = fp(async (app: FastifyInstance) => {
  app.addHook("onRequest", async (request, reply) => {
    const url = request.url;
    if (!url.startsWith("/api")) return;

    const method = request.method.toUpperCase();
    const path = url.split("?")[0] ?? url;

    if (isPublicApiPath(method, path)) return;

    const userCount = await app.prisma.user.count();
    if (userCount === 0) return; // Docker/dev without auth

    // Allow READ_ONLY for GET; require OPERATOR+ for mutations
    if (!request.authUser) {
      return reply.status(401).send({
        code: "AUTH_REQUIRED",
        message: "Please sign in to continue.",
      });
    }

    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return;
    }

    if (request.authUser.role === "READ_ONLY") {
      return reply.status(403).send({
        code: "FORBIDDEN",
        message: "Your account is read-only.",
      });
    }
  });
});
