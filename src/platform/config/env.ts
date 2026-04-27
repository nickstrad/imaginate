import "server-only";
import { z } from "zod";
import { MODEL_KEYS } from "@/shared/config/models";

const ModelIdSchema = z.enum(MODEL_KEYS);

const NodeEnvSchema = z
  .enum(["development", "test", "production"])
  .default("development");

const LogLevelSchema = z
  .enum(["debug", "info", "warn", "error"])
  .default("info");

export const EnvSchema = z.object({
  NODE_ENV: NodeEnvSchema,

  OPENROUTER_API_KEY: z.string().min(1).optional(),

  MODEL_PLANNER: ModelIdSchema.default(MODEL_KEYS.GEMINI_3_1_FLASH_LITE),
  MODEL_EXECUTOR_DEFAULT: ModelIdSchema.default(MODEL_KEYS.GEMINI_3_FLASH),
  MODEL_EXECUTOR_FALLBACK_1: ModelIdSchema.default(
    MODEL_KEYS.OPENAI_GPT_5_CODEX
  ),
  MODEL_EXECUTOR_FALLBACK_2: ModelIdSchema.default(
    MODEL_KEYS.CLAUDE_SONNET_4_6
  ),

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
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || undefined,
    MODEL_PLANNER: process.env.MODEL_PLANNER || undefined,
    MODEL_EXECUTOR_DEFAULT: process.env.MODEL_EXECUTOR_DEFAULT || undefined,
    MODEL_EXECUTOR_FALLBACK_1:
      process.env.MODEL_EXECUTOR_FALLBACK_1 || undefined,
    MODEL_EXECUTOR_FALLBACK_2:
      process.env.MODEL_EXECUTOR_FALLBACK_2 || undefined,
    LOG_LEVEL: process.env.LOG_LEVEL,
    RATE_LIMIT_PER_HOUR: process.env.RATE_LIMIT_PER_HOUR || undefined,
    LOG_PRETTY: process.env.LOG_PRETTY || undefined,
  };
}

export const env = EnvSchema.parse(readRaw());
export type Env = typeof env;

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
