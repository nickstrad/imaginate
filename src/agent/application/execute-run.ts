import {
  AGENT_CONFIG,
  TASK_SUMMARY_RE,
  addUsage,
  agentErrorMessage,
  buildErrorLogMetadata,
  buildTelemetry,
  classifyAgentError,
  EscalateReason,
  extractTaskSummary,
  readUsage,
  shouldEscalate,
  stepTextOf,
} from "../domain";
import { AgentRuntimeEventType } from "../domain/events";
import type { AgentError } from "../domain/errors";
import type {
  AgentStepSnapshot,
  PlanOutput,
  RunState,
  Thought,
  TelemetryPayload,
  UsageTotals,
} from "../domain/types";
import type {
  AgentEventSink,
  AgentLogger,
  GenerateTextResult,
  GenerateTextStepResult,
  ModelGateway,
  ModelMessage,
  SandboxGateway,
  ToolCallFinishEvent,
  ToolCallStartEvent,
  ToolFactory,
} from "../ports";
import { planSnippet } from "./plan-run";
import { logContextMutation } from "./context-logging";

const TOOL_RESULT_LOG_CHARS = 2000;

export interface ExecuteRunInput {
  previousMessages: ModelMessage[];
  plan: PlanOutput;
  runState: RunState;
  thoughts: Thought[];
  cumulativeUsage: UsageTotals;
  buildExecutorSystemPrompt: (planSnippet: string) => string;
  providerCacheOptions?: Record<string, unknown>;
  modelId: string;
}

export interface ExecuteRunDeps {
  modelGateway: ModelGateway;
  sandboxGateway: SandboxGateway;
  toolFactory: ToolFactory;
  eventSink: AgentEventSink;
  logger: AgentLogger;
  persistTelemetrySnapshot?: (payload: TelemetryPayload) => Promise<void>;
}

export interface ExecutorAttemptResult {
  result: GenerateTextResult | null;
  stepsCount: number;
  escalated: boolean;
  reason?: EscalateReason;
  error?: unknown;
}

function snapshotFromStep(step: GenerateTextStepResult): AgentStepSnapshot {
  const thought: Thought = {
    stepIndex: step.stepIndex,
    text: step.text ?? "",
    toolCalls: step.toolCalls,
    reasoningText: step.reasoningText,
    finishReason: step.finishReason,
  };
  return {
    stepIndex: step.stepIndex,
    thought,
    finishReason: step.finishReason,
  };
}

function toolCallEventBase(event: ToolCallStartEvent | ToolCallFinishEvent) {
  return {
    callId: event.callId,
    stepIndex: event.stepIndex,
    toolName: event.toolName,
  };
}

function recordCompletedToolCallId(
  map: Map<number, string[]>,
  stepIndex: number,
  id: string
) {
  const ids = map.get(stepIndex) ?? [];
  if (!ids.includes(id)) {
    ids.push(id);
  }
  map.set(stepIndex, ids);
}

function classifyToolCallError(err: unknown): AgentError {
  const classified = classifyAgentError(err);
  if (classified.category === "cancelled") {
    return classified;
  }
  return {
    code: "runtime.tool_failed",
    category: "tool_failed",
    retryable: false,
    message: `Tool call failed: ${agentErrorMessage(err)}`,
  };
}

function extractTaskSummaryFallback(
  result: GenerateTextResult | null,
  thoughts: Thought[]
): string | null {
  function* candidates(): Iterable<string> {
    yield stepTextOf(result);
    for (const s of result?.steps ?? []) {
      yield stepTextOf(s);
    }
    for (const t of thoughts) {
      if (t.text) {
        yield t.text;
      }
    }
  }
  return extractTaskSummary(candidates());
}

function iterationBoundaryMetadata(
  step: GenerateTextStepResult,
  ms: number
): Record<string, unknown> {
  const toolName = step.toolCalls?.[0]?.toolName;
  return {
    stepKind: toolName ? "tool" : "text",
    ...(toolName ? { toolName } : {}),
    ms,
  };
}

function logIterationBoundary(params: {
  logger: AgentLogger;
  step: GenerateTextStepResult;
  startedAt: number;
}): void {
  params.logger.info({
    event: "agent iteration",
    metadata: iterationBoundaryMetadata(
      params.step,
      Date.now() - params.startedAt
    ),
  });
}

function stringifyToolResult(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function cappedToolPayload(value: unknown): {
  value: unknown;
  length: number;
  truncated: boolean;
} {
  const serialized = stringifyToolResult(value);
  const truncated = serialized.length > TOOL_RESULT_LOG_CHARS;
  return {
    value: truncated ? serialized.slice(0, TOOL_RESULT_LOG_CHARS) : value,
    length: serialized.length,
    truncated,
  };
}

function logToolCall(params: {
  logger: AgentLogger;
  event: ToolCallFinishEvent;
}): void {
  const { logger, event } = params;
  logger.child({ scope: "tool" }).debug({
    event: "tool call",
    metadata: {
      callId: event.callId,
      stepIndex: event.stepIndex,
      toolName: event.toolName,
      durationMs: event.durationMs,
      args: event.args,
      ok: event.ok,
      result: event.ok
        ? cappedToolPayload(event.result)
        : cappedToolPayload(event.error),
    },
  });
}

export async function executeRun(args: {
  input: ExecuteRunInput;
  deps: ExecuteRunDeps;
}): Promise<ExecutorAttemptResult> {
  const { input, deps } = args;
  const {
    previousMessages,
    plan,
    runState,
    thoughts,
    cumulativeUsage,
    modelId,
  } = input;

  runState.totalAttempts += 1;
  const desc = deps.modelGateway.describeModel(modelId);
  runState.escalatedTo = `${desc.provider}:${desc.model}`;

  const sandbox = await deps.sandboxGateway.acquire();
  const tools = deps.toolFactory.createExecutorTools({ sandbox, runState });

  const systemPrompt = input.buildExecutorSystemPrompt(planSnippet(plan));
  const completedToolCallIdsByStep = new Map<number, string[]>();
  let iteration = 0;

  const onToolCallStart = async (event: ToolCallStartEvent) => {
    await deps.eventSink.emit({
      type: AgentRuntimeEventType.ToolCallRequested,
      ...toolCallEventBase(event),
      args: event.args,
    });
  };

  const onToolCallFinish = async (event: ToolCallFinishEvent) => {
    logToolCall({ logger: deps.logger, event });
    recordCompletedToolCallId(
      completedToolCallIdsByStep,
      event.stepIndex,
      event.callId
    );
    const base = {
      ...toolCallEventBase(event),
      durationMs: event.durationMs,
    };
    if (event.ok) {
      await deps.eventSink.emit({
        type: AgentRuntimeEventType.ToolCallCompleted,
        ...base,
        ok: true,
        result: event.result,
      });
      return;
    }
    await deps.eventSink.emit({
      type: AgentRuntimeEventType.ToolCallCompleted,
      ...base,
      ok: false,
      error: classifyToolCallError(event.error),
    });
  };

  try {
    const result = await deps.modelGateway.generateText({
      modelId,
      system: systemPrompt,
      messages: previousMessages,
      logger: deps.logger,
      tools,
      maxOutputTokens: AGENT_CONFIG.maxOutputTokens,
      providerOptions: input.providerCacheOptions,
      onToolCallStart,
      onToolCallFinish,
      stopWhen: [
        () => runState.finalOutput !== undefined,
        ({ steps }) => {
          const last = steps[steps.length - 1];
          const text = stepTextOf(last);
          return TASK_SUMMARY_RE.test(text);
        },
      ],
      onStepFinish: async (stepResult) => {
        iteration += 1;
        const iterationLogger = deps.logger.child({
          scope: "iter",
          bindings: { iteration },
        });
        const iterationStartedAt = Date.now();
        const snapshot = snapshotFromStep(stepResult);
        const toolCallIds = [
          ...(completedToolCallIdsByStep.get(snapshot.stepIndex) ?? []),
        ];

        iterationLogger.debug({
          event: "agent step",
          metadata: {
            stepIndex: snapshot.stepIndex,
            finishReason: snapshot.finishReason,
            text:
              snapshot.thought.text.length > 2000
                ? snapshot.thought.text.slice(0, 2000) + "…"
                : snapshot.thought.text,
            toolCalls: snapshot.thought.toolCalls?.map((tc) => tc.toolName),
          },
        });

        const contextBefore = thoughts.length;
        thoughts.push(snapshot.thought);
        logContextMutation({
          logger: iterationLogger,
          op: "append",
          before: contextBefore,
          after: thoughts.length,
          reason: "executor step finished",
        });
        addUsage(cumulativeUsage, readUsage(stepResult.usage));

        const telemetryPromise = deps.persistTelemetrySnapshot
          ? Promise.resolve(
              deps.persistTelemetrySnapshot(
                buildTelemetry(
                  runState,
                  snapshot.stepIndex + 1,
                  cumulativeUsage
                )
              )
              // best-effort telemetry snapshot — run progress still emits through the event sink.
            ).catch((e) =>
              iterationLogger.warn({
                event: "telemetry snapshot failed",
                metadata: { err: String(e) },
              })
            )
          : Promise.resolve();

        await Promise.all([
          deps.eventSink.emit({
            type: AgentRuntimeEventType.ExecutorStepFinished,
            step: snapshot,
            toolCallIds,
          }),
          telemetryPromise,
        ]);

        logIterationBoundary({
          logger: iterationLogger,
          step: stepResult,
          startedAt: iterationStartedAt,
        });
      },
    });

    if (!runState.finalOutput) {
      const fallback = extractTaskSummaryFallback(result, thoughts);
      if (fallback) {
        runState.finalOutput = {
          status: "success",
          title: "Fragment",
          summary: fallback,
          verification: runState.verification,
          nextSteps: [],
        };
      }
    }

    const stepsCount = Array.isArray(result?.steps) ? result.steps.length : 0;
    const decision = shouldEscalate(runState, result);
    return {
      result,
      stepsCount,
      escalated: decision.escalate,
      reason: decision.reason,
    };
  } catch (err) {
    deps.logger.error({
      event: "executor failed",
      metadata: buildErrorLogMetadata(err),
    });
    // Executor failures are returned to runAgent so model-ladder retry policy stays centralized.
    return {
      result: null,
      stepsCount: 0,
      escalated: true,
      reason: EscalateReason.Exception,
      error: err,
    };
  }
}
