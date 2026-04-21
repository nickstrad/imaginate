import "server-only";
import { z } from "zod";

const NodeEnvSchema = z
  .enum(["development", "test", "production"])
  .default("development");

const LogLevelSchema = z
  .enum(["debug", "info", "warn", "error"])
  .default("info");

const EnvSchema = z.object({
  NODE_ENV: NodeEnvSchema,

  OPENAI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),

  LOG_LEVEL: z.preprocess(
    (v) => (typeof v === "string" ? v.toLowerCase() : v),
    LogLevelSchema
  ),

  RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().optional(),

  LOG_PRETTY: z
    .preprocess(
      (v) => (typeof v === "string" ? v.toLowerCase() : v),
      z.enum(["auto", "true", "false"])
    )
    .default("auto"),
});

function readRaw() {
  return {
    NODE_ENV: process.env.NODE_ENV,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || undefined,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || undefined,
    LOG_LEVEL: process.env.LOG_LEVEL,
    RATE_LIMIT_PER_HOUR: process.env.RATE_LIMIT_PER_HOUR || undefined,
    LOG_PRETTY: process.env.LOG_PRETTY || undefined,
  };
}

export const env = EnvSchema.parse(readRaw());
export type Env = typeof env;

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
