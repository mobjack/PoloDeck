import type { FastifyInstance } from "fastify";
import { env } from "../config/env";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    return {
      status: "ok",
      uptimeMs: Math.round(process.uptime() * 1000),
      version: env.POLODECK_VERSION,
    };
  });

  /** Readiness for launcher / systemd — includes database connectivity. */
  app.get("/health/ready", async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      let setupComplete = true;
      if (env.POLODECK_REQUIRE_SETUP) {
        const settings = await app.prisma.installSettings.findUnique({
          where: { id: "default" },
        });
        setupComplete = Boolean(settings?.setupComplete);
      }
      return {
        status: "ready",
        version: env.POLODECK_VERSION,
        database: "ok",
        setupComplete,
        uptimeMs: Math.round(process.uptime() * 1000),
      };
    } catch {
      return reply.status(503).send({
        status: "not_ready",
        version: env.POLODECK_VERSION,
        database: "unavailable",
        message:
          "PoloDeck cannot reach its database yet. Wait a moment or check the service logs.",
      });
    }
  });
}
