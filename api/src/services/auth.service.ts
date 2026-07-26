import type { FastifyInstance, FastifyReply } from "fastify";
import {
  hashToken,
  sessionCookieName,
  sessionMaxAgeMs,
  type AuthUser,
} from "../plugins/auth";
import {
  generateSessionToken,
  hashPassword,
  verifyPassword,
} from "../lib/password";
import { SetupService } from "./setup.service";

export class AuthService {
  private readonly setup: SetupService;

  constructor(private readonly app: FastifyInstance) {
    this.setup = new SetupService(app);
  }

  async login(
    username: string,
    password: string,
    reply: FastifyReply
  ): Promise<AuthUser> {
    const user = await this.app.prisma.user.findUnique({
      where: { username: username.trim().toLowerCase() },
    });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      const err = new Error("Incorrect username or password.") as Error & {
        statusCode?: number;
        code?: string;
      };
      err.statusCode = 401;
      err.code = "INVALID_CREDENTIALS";
      throw err;
    }

    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + sessionMaxAgeMs());
    await this.app.prisma.session.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt,
      },
    });

    reply.setCookie(sessionCookieName(), token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: Math.floor(sessionMaxAgeMs() / 1000),
    });

    return { id: user.id, username: user.username, role: user.role };
  }

  async logout(token: string | undefined, reply: FastifyReply): Promise<void> {
    if (token) {
      await this.app.prisma.session
        .deleteMany({ where: { tokenHash: hashToken(token) } })
        .catch(() => {});
    }
    reply.clearCookie(sessionCookieName(), { path: "/" });
  }

  async resetPasswordWithRecovery(input: {
    recoveryCode: string;
    username: string;
    newPassword: string;
  }): Promise<void> {
    const ok = await this.setup.verifyRecoveryCode(input.recoveryCode);
    if (!ok) {
      const err = new Error("Recovery code is not valid.") as Error & {
        statusCode?: number;
        code?: string;
      };
      err.statusCode = 401;
      err.code = "INVALID_RECOVERY";
      throw err;
    }
    if (input.newPassword.length < 8) {
      const err = new Error("Password must be at least 8 characters.") as Error & {
        statusCode?: number;
      };
      err.statusCode = 400;
      throw err;
    }
    const user = await this.app.prisma.user.findUnique({
      where: { username: input.username.trim().toLowerCase() },
    });
    if (!user) {
      const err = new Error("User not found.") as Error & { statusCode?: number };
      err.statusCode = 404;
      throw err;
    }
    const passwordHash = await hashPassword(input.newPassword);
    await this.app.prisma.$transaction([
      this.app.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      this.app.prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);
  }
}
