import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel, ModelMessage } from "ai";
import { prisma } from "@/db";
import { MessageRole, MessageStatus } from "@/generated/prisma";
import { env } from "@/lib/config/env";
import { MODEL_IDS, type ModelId } from "@/lib/config/models";
import { getProviderKey } from "@/lib/provider-config";
import { type Provider } from "@/lib/providers";

export interface ResolvedModelConfig {
  provider: Provider;
  model: ModelId;
  apiKey: string;
}

export interface ModelSpec {
  provider: Provider;
  model: ModelId;
}

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

export function createModelProvider(
  config: ResolvedModelConfig
): LanguageModel {
  return createOpenRouter({ apiKey: config.apiKey })(MODEL_IDS[config.model]);
}

export type KeyResolver = (provider: Provider) => string | null | undefined;

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

export interface MessageRow {
  role: MessageRole;
  content: string;
}

export function toModelMessages(rows: readonly MessageRow[]): ModelMessage[] {
  return rows
    .map<ModelMessage>((m) => ({
      role: m.role === MessageRole.ASSISTANT ? "assistant" : "user",
      content: m.content,
    }))
    .reverse();
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

  return toModelMessages(messages);
}
