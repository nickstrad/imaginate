import { env } from "@/platform/config/env";
import { MODEL_KEYS } from "@/shared/config/models";
import type { ModelRoute, ModelSpec } from "./types";

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

const spec = (model: keyof typeof MODEL_KEYS): ModelSpec => ({
  provider: "openrouter",
  model,
});

// Per-route OpenRouter fallback lists. See
// docs/plans/open/openrouter-model-route-fallbacks.md for selection rationale.
// Order = preference; OpenRouter walks this list left-to-right when the
// primary errors with a retryable failure (rate limit, downtime, moderation,
// context-length validation). Cross-provider diversity is intentional —
// a single-provider outage should not take down a layer.
export const MODEL_ROUTES = {
  planner: {
    primary: MODEL_REGISTRY.planner,
    fallbacks: [spec("DEEPSEEK_CHAT_V3_1"), spec("GROK_4_1_FAST")],
  },
  executorDefault: {
    primary: MODEL_REGISTRY.executorDefault,
    fallbacks: [spec("QWEN_3_CODER"), spec("DEEPSEEK_V4_FLASH")],
  },
  executorFallback1: {
    primary: MODEL_REGISTRY.executorFallback1,
    fallbacks: [spec("GROK_CODE_FAST_1"), spec("DEEPSEEK_V4_FLASH")],
  },
  executorFallback2: {
    primary: MODEL_REGISTRY.executorFallback2,
    fallbacks: [spec("OPENAI_GPT_5_CODEX"), spec("KIMI_K2_6")],
  },
} satisfies Record<string, ModelRoute>;
