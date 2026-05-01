import { generateText, tool, type ModelMessage as AiModelMessage } from "ai";
import {
  EXECUTOR_LADDER,
  createModelProvider,
  fallbackSlugsFor,
  resolvePlannerModel,
  resolveSpec,
  type ModelSpec,
} from "@/platform/models";
import { isProvider, PROVIDERS } from "@/platform/providers/types";
import type {
  GenerateTextRequest,
  GenerateTextResult,
  GenerateTextStepResult,
  ModelDescriptor,
  ModelGateway,
  ProviderErrorClassification,
  ToolDefinition,
} from "../../ports";
import { classifyAgentError } from "../../domain/errors";

function specToString(spec: { provider: string; model: string }): string {
  return `${spec.provider}:${spec.model}`;
}

function parseSpec(modelId: string): ModelSpec {
  const idx = modelId.indexOf(":");
  if (idx < 0) {
    throw new Error(`invalid model id (expected provider:model): ${modelId}`);
  }
  const provider = modelId.slice(0, idx);
  const model = modelId.slice(idx + 1);
  if (!isProvider(provider)) {
    throw new Error(`invalid model id (unknown provider): ${modelId}`);
  }

  switch (provider) {
    case PROVIDERS.LM_STUDIO:
      return { provider, model };
    case PROVIDERS.OPENROUTER:
      return {
        provider,
        model: model as Extract<
          ModelSpec,
          { provider: typeof PROVIDERS.OPENROUTER }
        >["model"],
      };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function translateStep(stepResult: any): GenerateTextStepResult {
  const usageRaw = stepResult?.usage ?? {};
  const usage = {
    promptTokens:
      typeof usageRaw.promptTokens === "number"
        ? usageRaw.promptTokens
        : typeof usageRaw.inputTokens === "number"
          ? usageRaw.inputTokens
          : 0,
    completionTokens:
      typeof usageRaw.completionTokens === "number"
        ? usageRaw.completionTokens
        : typeof usageRaw.outputTokens === "number"
          ? usageRaw.outputTokens
          : 0,
    totalTokens:
      typeof usageRaw.totalTokens === "number" ? usageRaw.totalTokens : 0,
  };
  return {
    stepIndex: stepResult?.stepNumber ?? 0,
    text: typeof stepResult?.text === "string" ? stepResult.text : undefined,
    finishReason: stepResult?.finishReason,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toolCalls: stepResult?.toolCalls?.map((tc: any) => ({
      toolName: tc.toolName,
      args: tc.input,
    })),
    toolResults: stepResult?.toolResults?.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (tr: any) =>
        typeof tr.output === "string" ? tr.output : JSON.stringify(tr.output)
    ),
    reasoningText: stepResult?.reasoning?.[0]?.text,
    usage,
  };
}

function translateTools(
  tools: Record<string, ToolDefinition> | undefined
): Record<string, ReturnType<typeof tool>> | undefined {
  if (!tools) {
    return undefined;
  }
  const out: Record<string, ReturnType<typeof tool>> = {};
  for (const [name, def] of Object.entries(tools)) {
    out[name] = tool({
      description: def.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: def.inputSchema as any,
      execute: async (args: unknown) => def.execute(args),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }
  return out;
}

type StopWhenState = {
  stepCount?: number;
  steps?: unknown[];
};

export function createAiSdkModelGateway(): ModelGateway {
  return {
    async generateText(req: GenerateTextRequest): Promise<GenerateTextResult> {
      const spec = parseSpec(req.modelId);
      const resolved = resolveSpec(spec);
      const fallbackSlugs = fallbackSlugsFor(spec);
      const result = await generateText({
        model: createModelProvider(resolved, { fallbackSlugs }),
        system: req.system,
        messages: req.messages as AiModelMessage[],
        tools: translateTools(req.tools),
        maxOutputTokens: req.maxOutputTokens,
        providerOptions: req.providerOptions,
        stopWhen: req.stopWhen
          ? (req.stopWhen.map(
              (fn) => (state: StopWhenState) =>
                fn({
                  stepCount: state.stepCount ?? state.steps?.length ?? 0,
                  steps: (state.steps ?? []).map(translateStep),
                })
            ) as unknown as Parameters<typeof generateText>[0]["stopWhen"])
          : undefined,
        onStepFinish: req.onStepFinish
          ? async (stepResult: unknown) => {
              await req.onStepFinish!(translateStep(stepResult));
            }
          : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const usageRaw =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((result as any).usage as Record<string, unknown> | undefined) ?? {};
      const usage = {
        promptTokens:
          typeof usageRaw.promptTokens === "number"
            ? usageRaw.promptTokens
            : typeof usageRaw.inputTokens === "number"
              ? usageRaw.inputTokens
              : 0,
        completionTokens:
          typeof usageRaw.completionTokens === "number"
            ? usageRaw.completionTokens
            : typeof usageRaw.outputTokens === "number"
              ? usageRaw.outputTokens
              : 0,
        totalTokens:
          typeof usageRaw.totalTokens === "number" ? usageRaw.totalTokens : 0,
      };

      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        text: (result as any).text,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        steps: ((result as any).steps ?? []).map(translateStep),
        usage,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        finishReason: (result as any).finishReason,
      };
    },
    resolvePlannerModelId(): string {
      return specToString(resolvePlannerModel());
    },
    listExecutorModelIds(): string[] {
      return EXECUTOR_LADDER.map(specToString);
    },
    describeModel(modelId: string): ModelDescriptor {
      const spec = parseSpec(modelId);
      const resolved = resolveSpec(spec);
      return { provider: resolved.provider, model: resolved.model };
    },
    classifyError(err: unknown): ProviderErrorClassification {
      return classifyAgentError(err);
    },
  };
}
