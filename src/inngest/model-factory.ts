import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel, ModelMessage } from "ai";
import { prisma } from "@/db";
import { decryptApiKeys } from "@/lib/encryption";

export type Provider = "openai" | "anthropic" | "gemini";

export interface SelectedModels {
  openai?: string;
  anthropic?: string;
  gemini?: string;
}

export interface ResolvedModelConfig {
  provider: Provider;
  model: string;
  apiKey: string;
  openaiApiKey: string;
}

export function createModelProvider(
  provider: Provider,
  model: string,
  apiKey: string,
): LanguageModel {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "anthropic":
      return createAnthropic({ apiKey })(model);
    case "gemini":
      return createGoogleGenerativeAI({ apiKey })(model);
  }
}

export async function resolveModelConfig(
  userId: string,
  selectedModels: SelectedModels | undefined,
): Promise<ResolvedModelConfig> {
  const userSettings = await prisma.settings.findUnique({
    where: { userId },
  });

  if (!userSettings) {
    throw new Error("User settings not found");
  }

  const decryptedKeys = decryptApiKeys(
    {
      geminiApiKey: userSettings.geminiApiKey,
      openaiApiKey: userSettings.openaiApiKey,
      anthropicApiKey: userSettings.anthropicApiKey,
    },
    userId,
  );

  const sel = selectedModels || {};
  let provider: Provider = "openai";
  let model = "gpt-4o-mini";
  let apiKey = "";

  if (sel.openai && decryptedKeys.openaiApiKey) {
    provider = "openai";
    model = sel.openai;
    apiKey = decryptedKeys.openaiApiKey;
  } else if (sel.anthropic && decryptedKeys.anthropicApiKey) {
    provider = "anthropic";
    model = sel.anthropic;
    apiKey = decryptedKeys.anthropicApiKey;
  } else if (sel.gemini && decryptedKeys.geminiApiKey) {
    provider = "gemini";
    model = sel.gemini;
    apiKey = decryptedKeys.geminiApiKey;
  } else if (decryptedKeys.openaiApiKey) {
    apiKey = decryptedKeys.openaiApiKey;
  } else {
    throw new Error("No API key available for selected model");
  }

  return {
    provider,
    model,
    apiKey,
    openaiApiKey: decryptedKeys.openaiApiKey ?? "",
  };
}

export async function getPreviousMessages(
  projectId: string,
): Promise<ModelMessage[]> {
  const messages = await prisma.message.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return messages
    .map<ModelMessage>((m) => ({
      role: m.role === "ASSISTANT" ? "assistant" : "user",
      content: m.content,
    }))
    .reverse();
}
