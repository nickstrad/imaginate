import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { MODEL_IDS } from "@/lib/config/models";
import { getProviderKey } from "@/lib/providers";
import { MODEL_REGISTRY } from "./constants";
import type { KeyResolver, ModelSpec, ResolvedModelConfig } from "./types";

export function createModelProvider(
  config: ResolvedModelConfig
): LanguageModel {
  return createOpenRouter({ apiKey: config.apiKey })(MODEL_IDS[config.model]);
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
