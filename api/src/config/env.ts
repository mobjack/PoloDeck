import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z
    .string()
    .default("3000")
    .transform((v) => parseInt(v, 10)),
  /** Listen address. Native installs use 127.0.0.1 or 0.0.0.0 from first-run setup. */
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DEVICE_HEARTBEAT_INTERVAL_MS: z
    .string()
    .default("60000")
    .transform((v) => parseInt(v, 10)),
  DEVICE_STALE_AFTER_MS: z
    .string()
    .default("180000")
    .transform((v) => parseInt(v, 10)),
  /** Optional default for Pi installer GET /kb — Apt-Cacher NG base URL (e.g. http://host:3142). */
  POLODECK_PI_APT_PROXY: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === "") return undefined;
      const t = v.trim().replace(/\/$/, "");
      try {
        const u = new URL(t);
        if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
        return t;
      } catch {
        return undefined;
      }
    }),
  /**
   * Directory of built web-app static assets. When set, Fastify serves the SPA
   * (native single-process packaging). Docker continues to use nginx instead.
   */
  POLODECK_WEB_ROOT: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === "") return undefined;
      return v.trim();
    }),
  /**
   * When true, block mutating APIs until first-run setup completes.
   * Native packages set this; Docker/dev leave it unset.
   */
  POLODECK_REQUIRE_SETUP: z
    .string()
    .optional()
    .transform((v) => v === "1" || v?.toLowerCase() === "true"),
  /** Package / release version reported by /health. */
  POLODECK_VERSION: z.string().optional().default("0.1.0"),
  /**
   * UI port advertised in Pi /kb installer scripts.
   * Native single-port installs set this equal to PORT (typically 8080).
   * Docker leaves default 8080 while API listens on 3000.
   */
  POLODECK_UI_PORT: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === "") return undefined;
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : undefined;
    }),
  /** Session cookie signing secret (generated at install for native). */
  POLODECK_SESSION_SECRET: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === "") return undefined;
      return v.trim();
    }),
  /** Path to write bind-host updates after first-run (supervisor reloads). */
  POLODECK_CONFIG_ENV_PATH: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === "") return undefined;
      return v.trim();
    }),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
