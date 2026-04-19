import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel, ModelMessage } from "ai";
import { prisma } from "@/db";
import { MessageRole, MessageStatus } from "@/generated/prisma";
import { getProviderKey } from "@/lib/provider-config";
import {
  PROVIDERS,
  DEFAULT_FALLBACK_MODEL,
  type Provider,
  type SelectedModels,
} from "@/lib/providers";

export interface ResolvedModelConfig {
  provider: Provider;
  model: string;
  apiKey: string;
}

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

export function resolveModelConfig(
  selectedModels: SelectedModels | undefined
): ResolvedModelConfig {
  const sel = selectedModels ?? {};

  for (const provider of PROVIDERS) {
    const requested = sel[provider];
    if (!requested) continue;
    const apiKey = getProviderKey(provider);
    if (!apiKey) continue;
    return { provider, model: requested, apiKey };
  }

  const openaiKey = getProviderKey("openai");
  if (openaiKey) {
    return {
      provider: "openai",
      model: DEFAULT_FALLBACK_MODEL,
      apiKey: openaiKey,
    };
  }

  throw new Error("No API key available for selected model");
}

export function resolvePostprocModel(
  modelConfig: ResolvedModelConfig
): LanguageModel {
  const openaiKey = getProviderKey("openai");
  if (openaiKey) {
    return createOpenAI({ apiKey: openaiKey })(DEFAULT_FALLBACK_MODEL);
  }
  return createModelProvider(modelConfig);
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
