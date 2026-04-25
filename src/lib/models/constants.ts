import { env } from "@/lib/config/env";
import type { ModelSpec } from "./types";

export const MODEL_REGISTRY = {
  planner: { provider: "openrouter", model: env.MODEL_PLANNER },
  executorDefault: {
    provider: "openrouter",
    model: env.MODEL_EXECUTOR_DEFAULT,
  },
  executorFallback1: {
    provider: "openrouter",
    model: env.MODEL_EXECUTOR_FALLBACK_1,
  },
  executorFallback2: {
    provider: "openrouter",
    model: env.MODEL_EXECUTOR_FALLBACK_2,
  },
} satisfies Record<string, ModelSpec>;

export const EXECUTOR_LADDER: readonly ModelSpec[] = [
  MODEL_REGISTRY.executorDefault,
  MODEL_REGISTRY.executorFallback1,
  MODEL_REGISTRY.executorFallback2,
] as const;
