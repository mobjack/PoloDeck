import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import prismaPlugin from "./plugins/prisma";
import socketPlugin from "./plugins/socket";
import { registerHealthRoutes } from "./routes/health";
import { registerGameRoutes } from "./routes/games";

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

  return app;
}

