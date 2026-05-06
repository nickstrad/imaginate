import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { env } from "@/platform/config/env";
import { MODEL_IDS, type ModelId } from "@/shared/config/models";
import { getProviderKey } from "@/platform/providers";
import { PROVIDERS, type Provider } from "@/platform/providers/types";

interface BaseModelSpec {
  provider: Provider;
  model: string;
}

export interface OpenRouterModelSpec extends BaseModelSpec {
  provider: typeof PROVIDERS.OPENROUTER;
  model: ModelId;
}

export interface LmStudioModelSpec extends BaseModelSpec {
  provider: typeof PROVIDERS.LM_STUDIO;
}

export type ModelSpec = OpenRouterModelSpec | LmStudioModelSpec;

export interface OpenRouterResolvedModelConfig extends OpenRouterModelSpec {
  apiKey: string;
}

export interface LmStudioResolvedModelConfig extends LmStudioModelSpec {
  apiKey?: string;
  baseURL: string;
}

export type ResolvedModelConfig =
  | OpenRouterResolvedModelConfig
  | LmStudioResolvedModelConfig;

export type KeyResolver = (provider: Provider) => string | null | undefined;

interface ModelRoute {
  primary: ModelSpec;
  fallbacks: readonly OpenRouterModelSpec[];
}

type ModelKey = keyof typeof MODEL_IDS;
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
  return { provider: PROVIDERS.OPENROUTER, model };
}

function roleSpec(openrouterModel: ModelKey): ModelSpec {
  if (isLmStudioMode) {
    return { ...LM_STUDIO_MODEL_SPEC };
  }
  return openRouterSpec(openrouterModel);
}

const MODEL_REGISTRY = {
  planner: roleSpec(OPENROUTER_ROLE_MODELS.planner),
  executorDefault: roleSpec(OPENROUTER_ROLE_MODELS.executorDefault),
  executorFallback1: roleSpec(OPENROUTER_ROLE_MODELS.executorFallback1),
  executorFallback2: roleSpec(OPENROUTER_ROLE_MODELS.executorFallback2),
} satisfies Record<ModelRole, ModelSpec>;

const EXECUTOR_LADDER: readonly ModelSpec[] = isLmStudioMode
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

const MODEL_ROUTES = {
  planner: route("planner"),
  executorDefault: route("executorDefault"),
  executorFallback1: route("executorFallback1"),
  executorFallback2: route("executorFallback2"),
} satisfies Record<ModelRole, ModelRoute>;

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const OPENROUTER_IGNORED_PROVIDERS = ["amazon-bedrock"] as const;

export interface OpenRouterRequestOverrides {
  models?: string[];
  provider: { ignore: string[] };
}

export function buildOpenRouterRequestOverrides(
  spec: ModelSpec
): OpenRouterRequestOverrides | undefined {
  if (spec.provider !== PROVIDERS.OPENROUTER) {
    return undefined;
  }
  const fallbackSlugs = resolveFallbackSlugs(spec);
  return {
    provider: { ignore: [...OPENROUTER_IGNORED_PROVIDERS] },
    ...(fallbackSlugs.length > 0 ? { models: [...fallbackSlugs] } : {}),
  };
}

/**
 * Merge OpenRouter overrides for `spec` into a base `providerOptions` object.
 * No-op for non-OpenRouter specs.
 */
export function mergeOpenRouterProviderOptions(
  base: Record<string, unknown> | undefined,
  spec: ModelSpec
): Record<string, unknown> | undefined {
  const overrides = buildOpenRouterRequestOverrides(spec);
  if (!overrides) {
    return base;
  }
  const baseOpenRouter = (base?.openrouter as Record<string, unknown>) ?? {};
  return {
    ...base,
    openrouter: { ...baseOpenRouter, ...overrides },
  };
}

export function createModelProvider(
  config: ResolvedModelConfig
): LanguageModel {
  switch (config.provider) {
    case PROVIDERS.LM_STUDIO: {
      const provider = createOpenAICompatible({
        name: PROVIDERS.LM_STUDIO,
        baseURL: config.baseURL,
        apiKey: config.apiKey,
      });
      return provider.chatModel(config.model);
    }
    case PROVIDERS.OPENROUTER: {
      const provider = createOpenAICompatible({
        name: PROVIDERS.OPENROUTER,
        baseURL: OPENROUTER_BASE_URL,
        apiKey: config.apiKey,
      });
      return provider.chatModel(MODEL_IDS[config.model]);
    }
  }
}

export interface ResolveSpecOptions {
  lmStudioApiKey?: string;
  lmStudioBaseURL?: string;
}

function resolveLmStudioSpec(
  spec: LmStudioModelSpec,
  resolver: KeyResolver,
  options?: ResolveSpecOptions
): ResolvedModelConfig {
  const apiKey = options?.lmStudioApiKey ?? resolver(spec.provider);
  return {
    provider: spec.provider,
    model: spec.model,
    baseURL: options?.lmStudioBaseURL ?? env.LM_STUDIO_BASE_URL,
    ...(apiKey ? { apiKey } : {}),
  };
}

function resolveOpenRouterSpec(
  spec: OpenRouterModelSpec,
  resolver: KeyResolver
): OpenRouterResolvedModelConfig {
  const apiKey = resolver(spec.provider);
  if (apiKey) {
    return { provider: spec.provider, model: spec.model, apiKey };
  }
  throw new Error(
    `No API key available (wanted ${spec.provider}:${spec.model})`
  );
}

export function resolveSpecWith(
  spec: ModelSpec,
  resolver: KeyResolver,
  options?: ResolveSpecOptions
): ResolvedModelConfig {
  switch (spec.provider) {
    case PROVIDERS.LM_STUDIO:
      return resolveLmStudioSpec(spec, resolver, options);
    case PROVIDERS.OPENROUTER:
      return resolveOpenRouterSpec(spec, resolver);
  }
}

export function resolvePlannerModel(): ResolvedModelConfig {
  return resolveSpecWith(MODEL_REGISTRY.planner, getProviderKey);
}

export function resolveExecutorModels(): readonly ModelSpec[] {
  return EXECUTOR_LADDER;
}

export function resolveFallbackSlugs(primary: ModelSpec): readonly string[] {
  if (primary.provider !== PROVIDERS.OPENROUTER) {
    return [];
  }
  const found = Object.values(MODEL_ROUTES).find(
    (candidate) =>
      candidate.primary.provider === primary.provider &&
      candidate.primary.model === primary.model
  );
  return (found?.fallbacks ?? []).map((spec) => MODEL_IDS[spec.model]);
}

export { getPreviousMessages, toModelMessages } from "./messages";
