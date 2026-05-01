import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { env } from "@/platform/config/env";
import { MODEL_IDS } from "@/shared/config/models";
import { getProviderKey } from "@/platform/providers";
import { PROVIDERS } from "@/platform/providers/types";
import { MODEL_REGISTRY, MODEL_ROUTES } from "./constants";
import type {
  KeyResolver,
  LmStudioModelSpec,
  OpenRouterResolvedModelConfig,
  OpenRouterModelSpec,
  ModelSpec,
  ResolvedModelConfig,
} from "./types";

export interface CreateModelProviderOptions {
  fallbackSlugs?: readonly string[];
}

export function createModelProvider(
  config: ResolvedModelConfig,
  options?: CreateModelProviderOptions
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
      const factory = createOpenRouter({ apiKey: config.apiKey });
      const primarySlug = MODEL_IDS[config.model];
      if (options?.fallbackSlugs && options.fallbackSlugs.length > 0) {
        return factory(primarySlug, {
          models: [...options.fallbackSlugs],
        });
      }
      return factory(primarySlug);
    }
  }
}

export function resolveRouteFallbacks(
  primary: ModelSpec
): readonly OpenRouterModelSpec[] {
  const route = Object.values(MODEL_ROUTES).find(
    (candidate) =>
      candidate.primary.provider === primary.provider &&
      candidate.primary.model === primary.model
  );

  return route?.fallbacks ?? [];
}

export function fallbackSlugsFor(primary: ModelSpec): readonly string[] {
  if (primary.provider !== PROVIDERS.OPENROUTER) {
    return [];
  }
  return resolveRouteFallbacks(primary).map((spec) => MODEL_IDS[spec.model]);
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

export function resolveSpec(spec: ModelSpec): ResolvedModelConfig {
  return resolveSpecWith(spec, getProviderKey);
}

export function resolvePlannerModel(): ResolvedModelConfig {
  return resolveSpec(MODEL_REGISTRY.planner);
}
