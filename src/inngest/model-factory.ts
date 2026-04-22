import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel, ModelMessage } from "ai";
import { prisma } from "@/db";
import { MessageRole, MessageStatus } from "@/generated/prisma";
import { getProviderKey } from "@/lib/provider-config";
import { PROVIDERS, type Provider } from "@/lib/providers";

export interface ResolvedModelConfig {
  provider: Provider;
  model: string;
  apiKey: string;
}

export interface ModelSpec {
  provider: Provider;
  model: string;
}

export const MODEL_REGISTRY = {
  planner: { provider: "gemini", model: "gemini-3.1-flash-lite-preview" },
  executorDefault: { provider: "gemini", model: "gemini-3-flash-preview" },
  executorFallback1: { provider: "openai", model: "gpt-5" },
  executorFallback2: { provider: "anthropic", model: "claude-sonnet-4-6" },
} as const satisfies Record<string, ModelSpec>;

export const EXECUTOR_LADDER: readonly ModelSpec[] = [
  MODEL_REGISTRY.executorDefault,
  MODEL_REGISTRY.executorFallback1,
  MODEL_REGISTRY.executorFallback2,
] as const;

export function createModelProvider(
  config: ResolvedModelConfig
): LanguageModel {
  switch (config.provider) {
    case "openai":
      return createOpenAI({ apiKey: config.apiKey })(config.model);
    case "anthropic":
      return createAnthropic({ apiKey: config.apiKey })(config.model);
    case "gemini":
      return createGoogleGenerativeAI({ apiKey: config.apiKey })(config.model);
  }
}

export function resolveSpec(spec: ModelSpec): ResolvedModelConfig {
  const apiKey = getProviderKey(spec.provider);
  if (apiKey) {
    return { provider: spec.provider, model: spec.model, apiKey };
  }
  for (const provider of PROVIDERS) {
    const key = getProviderKey(provider);
    if (!key) continue;
    return { provider, model: spec.model, apiKey: key };
  }
  throw new Error(
    `No API key available (wanted ${spec.provider}:${spec.model})`
  );
}

export function resolvePlannerModel(): ResolvedModelConfig {
  return resolveSpec(MODEL_REGISTRY.planner);
}

export async function getPreviousMessages(
  projectId: string
): Promise<ModelMessage[]> {
  const messages = await prisma.message.findMany({
    where: {
      projectId,
      content: { not: "" },
      status: { not: MessageStatus.PENDING },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return messages
    .map<ModelMessage>((m) => ({
      role: m.role === MessageRole.ASSISTANT ? "assistant" : "user",
      content: m.content,
    }))
    .reverse();
}
