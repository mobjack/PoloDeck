import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SetupService } from "../services/setup.service";

const completeBodySchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(200),
  installName: z.string().min(1).max(120),
  networkAccess: z.enum(["LOCAL_ONLY", "LAN"]),
});

export async function registerSetupRoutes(app: FastifyInstance) {
  const service = new SetupService(app);

  app.get("/setup/status", async () => service.getStatus());

  app.post("/setup/complete", async (request, reply) => {
    const body = completeBodySchema.parse(request.body);
    try {
      const result = await service.completeSetup(body);
      reply.code(201);
      return result;
    } catch (e) {
      const err = e as Error & { statusCode?: number; code?: string };
      if (err.statusCode) {
        return reply.status(err.statusCode).send({
          code: err.code,
          message: err.message,
        });
      }
      throw e;
    }
  });
}
