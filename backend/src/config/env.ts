import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

/**
 * Custom validator for duration strings (e.g., "15m", "7h", "7d")
 */
const durationSchema = z.custom<`${number}${'s' | 'm' | 'h' | 'd'}`>((val) => {
  return typeof val === "string" && /^\d+[smhd]$/.test(val);
}, "Invalid duration format (must be like '15m', '1h', '7d')");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  MONGO_URI: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  // Enforce specific format types
  TOKEN_EXPIRES_IN: durationSchema.default("15m"),
  REFRESH_EXPIRES_IN: durationSchema.default("90d"),
});

export const env = EnvSchema.parse(process.env);

/**
 * Helper to convert "15m", "7d" into a future Date object for the Database
 */
export const getExpiryDate = (duration: string): Date => {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error("Invalid duration string");

  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;
  const now = Date.now();

  switch (unit) {
    case 's': return new Date(now + value * 1000);
    case 'm': return new Date(now + value * 60 * 1000);
    case 'h': return new Date(now + value * 60 * 60 * 1000);
    case 'd': return new Date(now + value * 24 * 60 * 60 * 1000);
    default: return new Date(now);
  }
};