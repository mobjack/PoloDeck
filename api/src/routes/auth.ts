import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sessionCookieName } from "../plugins/auth";
import { AuthService } from "../services/auth.service";

const loginBodySchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});

const recoveryBodySchema = z.object({
  recoveryCode: z.string().min(8).max(80),
  username: z.string().min(1).max(64),
  newPassword: z.string().min(8).max(200),
});

export async function registerAuthRoutes(app: FastifyInstance) {
  const service = new AuthService(app);

  app.get("/auth/me", async (request) => {
    if (!request.authUser) {
      return { user: null };
    }
    return { user: request.authUser };
  });

  app.post("/auth/login", async (request, reply) => {
    const body = loginBodySchema.parse(request.body);
    try {
      const user = await service.login(body.username, body.password, reply);
      return { user };
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

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies?.[sessionCookieName()];
    await service.logout(token, reply);
    return { ok: true };
  });

  app.post("/auth/recovery-reset", async (request, reply) => {
    const body = recoveryBodySchema.parse(request.body);
    try {
      await service.resetPasswordWithRecovery(body);
      return { ok: true };
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
