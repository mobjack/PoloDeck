import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z
    .string()
    .default("3000")
    .transform((v) => parseInt(v, 10)),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DEVICE_HEARTBEAT_INTERVAL_MS: z
    .string()
    .default("60000")
    .transform((v) => parseInt(v, 10)),
  DEVICE_STALE_AFTER_MS: z
    .string()
    .default("180000")
    .transform((v) => parseInt(v, 10)),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;

