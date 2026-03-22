import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import prismaPlugin from "./plugins/prisma";
import socketPlugin from "./plugins/socket";
import { registerHealthRoutes } from "./routes/health";
import { registerGameRoutes } from "./routes/games";
import { isDatabaseConnectionError } from "./lib/databaseErrors";

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyHelmet);

  await app.register(prismaPlugin);
  await app.register(socketPlugin);

  await app.register(registerHealthRoutes);
  await app.register(registerGameRoutes, { prefix: "/api" });

  app.setErrorHandler((error, _request, reply) => {
    if (isDatabaseConnectionError(error)) {
      app.log.warn({ err: error }, "database unreachable");
      return reply.status(503).send({
        code: "DATABASE_UNAVAILABLE",
        message:
          "We couldn’t reach the database. Make sure PostgreSQL is running and try again.",
      });
    }

    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof (error as { statusCode?: number }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;

    const message =
      error instanceof Error ? error.message : "Internal Server Error";

    if (statusCode >= 500) {
      app.log.error(error);
    }

    return reply.status(statusCode).send({ message });
  });

  return app;
}

