import {
  AGENT_CONFIG,
  TASK_SUMMARY_RE,
  addUsage,
  buildTelemetry,
  EscalateReason,
  extractTaskSummary,
  readUsage,
  shouldEscalate,
  stepTextOf,
} from "../domain";
import { AgentRuntimeEventType } from "../domain/events";
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
  ToolFactory,
} from "../ports";
import { planSnippet } from "./plan-run";

export interface ExecuteRunInput {
  userPrompt: string;
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
    toolResults: step.toolResults,
    reasoningText: step.reasoningText,
    finishReason: step.finishReason,
  };
  return {
    stepIndex: step.stepIndex,
    thought,
    finishReason: step.finishReason,
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

export async function executeRun(args: {
  input: ExecuteRunInput;
  deps: ExecuteRunDeps;
}): Promise<ExecutorAttemptResult> {
  const { input, deps } = args;
  const {
    userPrompt,
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

  try {
    const result = await deps.modelGateway.generateText({
      modelId,
      system: systemPrompt,
      messages: [...previousMessages, { role: "user", content: userPrompt }],
      tools,
      maxOutputTokens: AGENT_CONFIG.maxOutputTokens,
      providerOptions: input.providerCacheOptions,
      stopWhen: [
        () => runState.finalOutput !== undefined,
        ({ steps }) => {
          const last = steps[steps.length - 1];
          const text = stepTextOf(last);
          return TASK_SUMMARY_RE.test(text);
        },
      ],
      onStepFinish: async (stepResult) => {
        const snapshot = snapshotFromStep(stepResult);

        deps.logger.info({
          event: "agent step",
          metadata: {
            stepIndex: snapshot.stepIndex,
            finishReason: snapshot.finishReason,
            text:
              snapshot.thought.text.length > 300
                ? snapshot.thought.text.slice(0, 300) + "…"
                : snapshot.thought.text,
            toolCalls: snapshot.thought.toolCalls?.map((tc) => tc.toolName),
          },
        });

        thoughts.push(snapshot.thought);
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
            ).catch((e) =>
              deps.logger.warn({
                event: "telemetry snapshot failed",
                metadata: { err: String(e) },
              })
            )
          : Promise.resolve();

        await Promise.all([
          deps.eventSink.emit({
            type: AgentRuntimeEventType.ExecutorStepFinished,
            step: snapshot,
          }),
          telemetryPromise,
        ]);
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
    return {
      result: null,
      stepsCount: 0,
      escalated: true,
      reason: EscalateReason.Exception,
      error: err,
    };
  }
}
