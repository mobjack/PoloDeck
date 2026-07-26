import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env";
import { detectLanIPv4, listLanIPv4 } from "../lib/networkInfo";
import {
  generateRecoveryCode,
  hashPassword,
  verifyPassword,
} from "../lib/password";

export type SetupStatus = {
  setupComplete: boolean;
  requireSetup: boolean;
  installName: string | null;
  networkAccess: "LOCAL_ONLY" | "LAN" | null;
  version: string;
  listenPort: number;
  uiPort: number;
  bindHost: string;
  lanAddresses: string[];
  primaryLanAddress: string | null;
  authEnabled: boolean;
};

export type CompleteSetupInput = {
  username: string;
  password: string;
  installName: string;
  networkAccess: "LOCAL_ONLY" | "LAN";
};

function uiPort(): number {
  return env.POLODECK_UI_PORT ?? env.PORT;
}

function upsertEnvKey(filePath: string, key: string, value: string): void {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, `${key}=${value}\n`, { mode: 0o600 });
    return;
  }
  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) next.push(`${key}=${value}`);
  writeFileSync(filePath, `${next.filter((l, i) => l !== "" || i < next.length - 1).join("\n").replace(/\n*$/, "\n")}`, {
    mode: 0o600,
  });
}

export class SetupService {
  constructor(private readonly app: FastifyInstance) {}

  async getOrCreateSettings() {
    return this.app.prisma.installSettings.upsert({
      where: { id: "default" },
      create: { id: "default", setupComplete: false },
      update: {},
    });
  }

  async getStatus(): Promise<SetupStatus> {
    const settings = await this.getOrCreateSettings();
    const userCount = await this.app.prisma.user.count();
    return {
      setupComplete: settings.setupComplete,
      requireSetup: Boolean(env.POLODECK_REQUIRE_SETUP),
      installName: settings.installName,
      networkAccess: settings.setupComplete ? settings.networkAccess : null,
      version: env.POLODECK_VERSION,
      listenPort: env.PORT,
      uiPort: uiPort(),
      bindHost: env.HOST,
      lanAddresses: listLanIPv4(),
      primaryLanAddress: detectLanIPv4(),
      authEnabled: userCount > 0,
    };
  }

  async completeSetup(input: CompleteSetupInput): Promise<{
    recoveryCode: string;
    status: SetupStatus;
  }> {
    const settings = await this.getOrCreateSettings();
    if (settings.setupComplete) {
      const err = new Error("Setup has already been completed.") as Error & {
        statusCode?: number;
        code?: string;
      };
      err.statusCode = 409;
      err.code = "SETUP_ALREADY_COMPLETE";
      throw err;
    }

    const username = input.username.trim().toLowerCase();
    if (username.length < 3 || username.length > 64) {
      const err = new Error("Username must be between 3 and 64 characters.") as Error & {
        statusCode?: number;
      };
      err.statusCode = 400;
      throw err;
    }
    if (!/^[a-z0-9._-]+$/.test(username)) {
      const err = new Error(
        "Username may only use letters, numbers, dots, underscores, and hyphens."
      ) as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }
    if (input.password.length < 8) {
      const err = new Error("Password must be at least 8 characters.") as Error & {
        statusCode?: number;
      };
      err.statusCode = 400;
      throw err;
    }
    const installName = input.installName.trim();
    if (installName.length < 1 || installName.length > 120) {
      const err = new Error("Please enter a name for this PoloDeck.") as Error & {
        statusCode?: number;
      };
      err.statusCode = 400;
      throw err;
    }

    const recoveryCode = generateRecoveryCode();
    const passwordHash = await hashPassword(input.password);
    const recoveryCodeHash = await hashPassword(recoveryCode);
    const bindHost = input.networkAccess === "LAN" ? "0.0.0.0" : "127.0.0.1";

    await this.app.prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          username,
          passwordHash,
          role: "ADMINISTRATOR",
        },
      });
      await tx.installSettings.update({
        where: { id: "default" },
        data: {
          setupComplete: true,
          installName,
          networkAccess: input.networkAccess,
          recoveryCodeHash,
        },
      });
    });

    if (env.POLODECK_CONFIG_ENV_PATH) {
      try {
        upsertEnvKey(env.POLODECK_CONFIG_ENV_PATH, "HOST", bindHost);
        upsertEnvKey(
          env.POLODECK_CONFIG_ENV_PATH,
          "POLODECK_NETWORK_ACCESS",
          input.networkAccess
        );
        appendFileSync(
          env.POLODECK_CONFIG_ENV_PATH,
          `# Updated by first-run setup ${new Date().toISOString()}\n`
        );
      } catch (e) {
        this.app.log.warn({ err: e }, "could not persist HOST to config env path");
      }
    }

    // Apply bind change in-process for the rest of this process lifetime when possible.
    // Supervisor may still restart after setup for a clean listen.
    (process.env as { HOST?: string }).HOST = bindHost;

    return {
      recoveryCode,
      status: await this.getStatus(),
    };
  }

  async verifyRecoveryCode(code: string): Promise<boolean> {
    const settings = await this.getOrCreateSettings();
    if (!settings.recoveryCodeHash) return false;
    return verifyPassword(code.trim().toUpperCase(), settings.recoveryCodeHash);
  }
}
