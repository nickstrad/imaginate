import { env } from "@/platform/config/env";
import { MODEL_KEYS } from "@/shared/config/models";
import { PROVIDERS } from "@/platform/providers/types";
import type { ModelRoute, ModelSpec, OpenRouterModelSpec } from "./types";

type ModelKey = keyof typeof MODEL_KEYS;
type ModelRole =
  | "planner"
  | "executorDefault"
  | "executorFallback1"
  | "executorFallback2";

const isLmStudioMode = env.MODEL_PROVIDER === PROVIDERS.LM_STUDIO;

const LM_STUDIO_MODEL_SPEC: ModelSpec = {
  provider: PROVIDERS.LM_STUDIO,
  model: env.LM_STUDIO_MODEL,
};

const OPENROUTER_ROLE_MODELS = {
  planner: env.MODEL_PLANNER,
  executorDefault: env.MODEL_EXECUTOR_DEFAULT,
  executorFallback1: env.MODEL_EXECUTOR_FALLBACK_1,
  executorFallback2: env.MODEL_EXECUTOR_FALLBACK_2,
} satisfies Record<ModelRole, ModelKey>;

const OPENROUTER_ROUTE_FALLBACKS = {
  planner: ["DEEPSEEK_CHAT_V3_1", "GROK_4_1_FAST"],
  executorDefault: ["QWEN_3_CODER", "DEEPSEEK_V4_FLASH"],
  executorFallback1: ["GROK_CODE_FAST_1", "DEEPSEEK_V4_FLASH"],
  executorFallback2: ["OPENAI_GPT_5_CODEX", "KIMI_K2_6"],
} satisfies Record<ModelRole, readonly ModelKey[]>;

function openRouterSpec(model: ModelKey): OpenRouterModelSpec {
  return {
    provider: PROVIDERS.OPENROUTER,
    model,
  };
}

function roleSpec(openrouterModel: ModelKey): ModelSpec {
  if (isLmStudioMode) {
    return {
      ...LM_STUDIO_MODEL_SPEC,
    };
  }
  return openRouterSpec(openrouterModel);
}

export const MODEL_REGISTRY = {
  planner: roleSpec(OPENROUTER_ROLE_MODELS.planner),
  executorDefault: roleSpec(OPENROUTER_ROLE_MODELS.executorDefault),
  executorFallback1: roleSpec(OPENROUTER_ROLE_MODELS.executorFallback1),
  executorFallback2: roleSpec(OPENROUTER_ROLE_MODELS.executorFallback2),
} satisfies Record<ModelRole, ModelSpec>;

export const EXECUTOR_LADDER: readonly ModelSpec[] = isLmStudioMode
  ? [MODEL_REGISTRY.executorDefault]
  : [
      MODEL_REGISTRY.executorDefault,
      MODEL_REGISTRY.executorFallback1,
      MODEL_REGISTRY.executorFallback2,
    ];

function routeFallbacks(role: ModelRole): readonly OpenRouterModelSpec[] {
  if (isLmStudioMode) {
    return [];
  }
  return OPENROUTER_ROUTE_FALLBACKS[role].map(openRouterSpec);
}

function route(role: ModelRole): ModelRoute {
  return {
    primary: MODEL_REGISTRY[role],
    fallbacks: routeFallbacks(role),
  };
}

// Per-route OpenRouter fallback lists. LM Studio mode intentionally returns no
// fallbacks so local model experiments use one planner and one executor rung.
// See
// docs/plans/open/openrouter-model-route-fallbacks.md for selection rationale.
// Order = preference; OpenRouter walks this list left-to-right when the
// primary errors with a retryable failure (rate limit, downtime, moderation,
// context-length validation). Cross-provider diversity is intentional —
// a single-provider outage should not take down a layer.
export const MODEL_ROUTES = {
  planner: route("planner"),
  executorDefault: route("executorDefault"),
  executorFallback1: route("executorFallback1"),
  executorFallback2: route("executorFallback2"),
} satisfies Record<ModelRole, ModelRoute>;
