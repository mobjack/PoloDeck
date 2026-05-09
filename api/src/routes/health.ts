import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    return {
      status: "ok",
      uptimeMs: Math.round(process.uptime() * 1000),
    };
  });
}

