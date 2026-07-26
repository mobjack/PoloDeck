import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
const COOKIE_NAME = "polodeck_session";
const SESSION_DAYS = 14;

export type UserRoleName = "ADMINISTRATOR" | "OPERATOR" | "READ_ONLY";

export type AuthUser = {
  id: string;
  username: string;
  role: UserRoleName;
};

declare module "fastify" {
  interface FastifyRequest {
    authUser: AuthUser | null;
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieName(): string {
  return COOKIE_NAME;
}

export function sessionMaxAgeMs(): number {
  return SESSION_DAYS * 24 * 60 * 60 * 1000;
}

async function loadUserFromCookie(
  app: FastifyInstance,
  request: FastifyRequest
): Promise<AuthUser | null> {
  const token = request.cookies?.[COOKIE_NAME];
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = await app.prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) {
    if (session) {
      await app.prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    }
    return null;
  }
  return {
    id: session.user.id,
    username: session.user.username,
    role: session.user.role,
  };
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest("authUser", null);

  app.addHook("onRequest", async (request) => {
    try {
      request.authUser = await loadUserFromCookie(app, request);
    } catch {
      request.authUser = null;
    }
  });
});

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<AuthUser | null> {
  if (!request.authUser) {
    await reply.status(401).send({
      code: "AUTH_REQUIRED",
      message: "Please sign in to continue.",
    });
    return null;
  }
  return request.authUser;
}

export async function requireRole(
  request: FastifyRequest,
  reply: FastifyReply,
  roles: UserRoleName[]
): Promise<AuthUser | null> {
  const user = await requireAuth(request, reply);
  if (!user) return null;
  if (!roles.includes(user.role)) {
    await reply.status(403).send({
      code: "FORBIDDEN",
      message: "You do not have permission for this action.",
    });
    return null;
  }
  return user;
}

/** Paths under /api that stay public (kiosk + setup + auth + read health helpers). */
export function isPublicApiPath(method: string, urlPath: string): boolean {
  const path = urlPath.split("?")[0] ?? urlPath;

  if (path.startsWith("/api/setup")) return true;
  if (path.startsWith("/api/auth")) return true;
  if (path === "/api/capabilities") return true;
  if (path === "/api/active-game") return true;
  if (path === "/api/devices/check-in" && method === "POST") return true;

  // Kiosk / display reads (device admin list stays authenticated)
  if (method === "GET") {
    if (path === "/api/games" || path.startsWith("/api/games/")) return true;
  }

  return false;
}
