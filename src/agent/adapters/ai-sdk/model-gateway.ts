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
  GenerateTextToolCall,
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

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readNumber(
  record: Record<string, unknown>,
  key: string
): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

function readString(
  record: Record<string, unknown>,
  key: string
): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function translateUsage(usage: unknown): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} {
  const raw = asRecord(usage);
  return {
    promptTokens:
      readNumber(raw, "promptTokens") ?? readNumber(raw, "inputTokens") ?? 0,
    completionTokens:
      readNumber(raw, "completionTokens") ??
      readNumber(raw, "outputTokens") ??
      0,
    totalTokens: readNumber(raw, "totalTokens") ?? 0,
  };
}

function translateToolCall(
  toolCall: unknown,
  stepIndex: number,
  index: number
): GenerateTextToolCall | undefined {
  const raw = asRecord(toolCall);
  const toolName = readString(raw, "toolName");
  if (!toolName) {
    return undefined;
  }
  const callId =
    readString(raw, "toolCallId") ??
    readString(raw, "id") ??
    `step:${stepIndex}:tool:${index}`;
  return {
    callId,
    toolName,
    args: asRecord(raw.input),
  };
}

function translateToolCalls(
  toolCalls: unknown,
  stepIndex: number
): GenerateTextToolCall[] | undefined {
  if (!Array.isArray(toolCalls)) {
    return undefined;
  }
  return toolCalls
    .map((toolCall, index) => translateToolCall(toolCall, stepIndex, index))
    .filter(
      (toolCall): toolCall is GenerateTextToolCall => toolCall !== undefined
    );
}

function translateStep(stepResult: unknown): GenerateTextStepResult {
  const raw = asRecord(stepResult);
  const stepIndex = readNumber(raw, "stepNumber") ?? 0;
  const reasoning = raw.reasoning;
  const firstReasoning =
    Array.isArray(reasoning) && reasoning.length > 0
      ? asRecord(reasoning[0])
      : {};
  return {
    stepIndex,
    text: readString(raw, "text"),
    finishReason: readString(raw, "finishReason"),
    toolCalls: translateToolCalls(raw.toolCalls, stepIndex),
    reasoningText: readString(firstReasoning, "text"),
    usage: translateUsage(raw.usage),
  };
}

function translateToolLifecycleBase(
  event: unknown
):
  | (GenerateTextToolCall & { stepIndex: number; durationMs?: number })
  | undefined {
  const raw = asRecord(event);
  const stepIndex = readNumber(raw, "stepNumber") ?? 0;
  const toolCall = translateToolCall(raw.toolCall, stepIndex, 0);
  if (!toolCall) {
    return undefined;
  }
  return {
    ...toolCall,
    stepIndex,
    durationMs: readNumber(raw, "durationMs"),
  };
}

async function notifyToolCallStart(
  req: GenerateTextRequest,
  event: unknown
): Promise<void> {
  if (!req.onToolCallStart) {
    return;
  }
  const base = translateToolLifecycleBase(event);
  if (!base) {
    return;
  }
  await req.onToolCallStart({
    callId: base.callId,
    stepIndex: base.stepIndex,
    toolName: base.toolName,
    args: base.args,
  });
}

async function notifyToolCallFinish(
  req: GenerateTextRequest,
  event: unknown
): Promise<void> {
  if (!req.onToolCallFinish) {
    return;
  }
  const raw = asRecord(event);
  const base = translateToolLifecycleBase(event);
  if (!base) {
    return;
  }
  if (raw.success === true) {
    await req.onToolCallFinish({
      ...base,
      ok: true,
      result: raw.output,
    });
    return;
  }
  if (raw.success !== false) {
    return;
  }
  await req.onToolCallFinish({
    ...base,
    ok: false,
    error: raw.error,
  });
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK tool schema generics are wider than the neutral port can express.
      inputSchema: def.inputSchema as any,
      execute: async (args: unknown) => def.execute(args),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK tool helper expects SDK-specific generic fields hidden by the port.
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
        experimental_onToolCallStart: req.onToolCallStart
          ? async (event: unknown) => {
              await notifyToolCallStart(req, event);
            }
          : undefined,
        experimental_onToolCallFinish: req.onToolCallFinish
          ? async (event: unknown) => {
              await notifyToolCallFinish(req, event);
            }
          : undefined,
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
              await req.onStepFinish?.(translateStep(stepResult));
            }
          : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generateText's generic option type cannot be represented after translating neutral port tools.
      } as any);

      const raw = asRecord(result);
      const steps = Array.isArray(raw.steps) ? raw.steps : [];

      return {
        text: readString(raw, "text"),
        steps: steps.map(translateStep),
        usage: translateUsage(raw.usage),
        finishReason: readString(raw, "finishReason"),
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
