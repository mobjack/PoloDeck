import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import { env } from "./config/env";
import { isDatabaseConnectionError } from "./lib/databaseErrors";
import { authPlugin } from "./plugins/auth";
import prismaPlugin from "./plugins/prisma";
import { authGatePlugin, setupGatePlugin } from "./plugins/setupGate";
import socketPlugin from "./plugins/socket";
import { webStaticPlugin } from "./plugins/webStatic";
import { registerAuthRoutes } from "./routes/auth";
import { registerGameRoutes } from "./routes/games";
import { registerHealthRoutes } from "./routes/health";
import { registerKioskBootstrapRoutes } from "./routes/kioskBootstrap";
import { registerSetupRoutes } from "./routes/setup";

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(fastifyCors, {
    origin: true,
    credentials: true,
  });
  await app.register(fastifyHelmet, {
    // SPA + same-origin API; allow inline for Vite-built assets as needed
    contentSecurityPolicy: false,
  });
  await app.register(fastifyCookie, {
    secret: env.POLODECK_SESSION_SECRET ?? "polodeck-dev-cookie-secret",
  });

  await app.register(prismaPlugin);
  await app.register(authPlugin);
  await app.register(setupGatePlugin);
  await app.register(authGatePlugin);
  await app.register(socketPlugin);

  await app.register(registerHealthRoutes);
  await app.register(registerKioskBootstrapRoutes);
  await app.register(registerSetupRoutes, { prefix: "/api" });
  await app.register(registerAuthRoutes, { prefix: "/api" });
  await app.register(registerGameRoutes, { prefix: "/api" });

  // Static UI last so API routes take precedence
  await app.register(webStaticPlugin);

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
