import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

/**
 * Load .env files in this order (later overrides earlier):
 *  - .env
 *  - .env.<NODE_ENV>
 *  - .env.<NODE_ENV>.local
 *
 * dotenv.config() by default reads process.cwd()/.env. We load the environment-specific
 * file explicitly so you can have .env.development, .env.test, .env.production, etc.
 */
const NODE_ENV = process.env.NODE_ENV ?? "development";
const baseEnv = path.resolve(process.cwd(), ".env");
const envFiles = [
  baseEnv,
  path.resolve(process.cwd(), `.env.${NODE_ENV}`),
  path.resolve(process.cwd(), `.env.${NODE_ENV}.local`),
];

for (const f of envFiles) {
  // dotenv.config is safe if file missing; it only sets variables that aren't already present
  dotenv.config({ path: f });
}

/**
 * Validation schema (Zod)
 * Keep everything required that the app needs to run; provide sensible defaults where appropriate.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z
    .string()
    .transform((s) => Number(s))
    .refine((n) => Number.isInteger(n) && n > 0 && n < 65536, { message: "PORT must be a valid port number" })
    .default(4000),
  CORS_ORIGIN: z.string().min(1).default("*"),

  MONGO_URI: z.string().min(1),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),
  TOKEN_EXPIRES_IN: z.string().default("15m"),
  REFRESH_EXPIRES_IN: z.string().default("7d"),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Optional flags
  DISABLE_EMAIL: z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean()).optional(),
}).strict();

/**
 * Parse and export
 */
const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  // Print human-friendly error list
  console.error(parsed.error.format());
  // Fail fast — don't let the app run with bad config
  process.exit(1);
}

/**
 * Typed env exported across the app
 */
export const env = parsed.data;

/**
 * Helper: convert duration strings like "15m", "7d" to milliseconds
 * Used by token service or cookie helpers
 */
export function durationToMs(value: string): number {
  const m = /^(\d+)(s|m|h|d)$/.exec(value);
  if (!m) return 0;
  const n = Number(m[1]);
  switch (m[2]) {
    case "s":
      return n * 1000;
    case "m":
      return n * 60_000;
    case "h":
      return n * 3_600_000;
    case "d":
      return n * 86_400_000;
    default:
      return 0;
  }
}

/**
 * Example typed usage:
 * import { env } from "../config/env.js";
 * const port: number = env.PORT;
 */
export type Env = typeof env;
