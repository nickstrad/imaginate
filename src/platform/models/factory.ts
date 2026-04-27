import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { MODEL_IDS } from "@/shared/config/models";
import { getProviderKey } from "@/platform/providers";
import { MODEL_REGISTRY, MODEL_ROUTES } from "./constants";
import type { KeyResolver, ModelSpec, ResolvedModelConfig } from "./types";

export interface CreateModelProviderOptions {
  fallbackSlugs?: readonly string[];
}

export function createModelProvider(
  config: ResolvedModelConfig,
  options?: CreateModelProviderOptions
): LanguageModel {
  const factory = createOpenRouter({ apiKey: config.apiKey });
  const primarySlug = MODEL_IDS[config.model];
  if (options?.fallbackSlugs && options.fallbackSlugs.length > 0) {
    return factory(primarySlug, {
      models: [...options.fallbackSlugs],
    });
  }
  return factory(primarySlug);
}

export function resolveRouteFallbacks(primary: ModelSpec): readonly ModelSpec[] {
  for (const route of Object.values(MODEL_ROUTES)) {
    if (
      route.primary.provider === primary.provider &&
      route.primary.model === primary.model
    ) {
      return route.fallbacks;
    }
  }
  return [];
}

export function fallbackSlugsFor(primary: ModelSpec): readonly string[] {
  return resolveRouteFallbacks(primary).map((spec) => MODEL_IDS[spec.model]);
}

export function resolveSpecWith(
  spec: ModelSpec,
  resolver: KeyResolver
): ResolvedModelConfig {
  const apiKey = resolver(spec.provider);
  if (apiKey) {
    return { provider: spec.provider, model: spec.model, apiKey };
  }
  throw new Error(
    `No API key available (wanted ${spec.provider}:${spec.model})`
  );
}

export function resolveSpec(spec: ModelSpec): ResolvedModelConfig {
  return resolveSpecWith(spec, getProviderKey);
}

export function resolvePlannerModel(): ResolvedModelConfig {
  return resolveSpec(MODEL_REGISTRY.planner);
}
