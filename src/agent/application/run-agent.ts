import {
  buildTelemetry,
  createRunState,
  freezeRunState,
  persistTelemetryWith,
} from "../domain";
import { AgentRuntimeEventType } from "../domain/events";
import {
  agentErrorMessage,
  classifyAgentError,
  type AgentError,
} from "../domain/errors";
import type {
  AgentRunInput,
  AgentRunResult,
  Thought,
  UsageTotals,
} from "../domain/types";
import { planRun } from "./plan-run";
import { executeRun } from "./execute-run";
import type { AgentRuntimeDeps } from "./run-agent-deps";
import type { ModelMessage } from "../ports";

export type { AgentRuntimeDeps } from "./run-agent-deps";

export interface RunAgentArgs {
  input: AgentRunInput;
  deps: AgentRuntimeDeps;
  config: {
    plannerSystemPrompt: string;
    buildExecutorSystemPrompt: (planSnippet: string) => string;
    providerCacheOptions?: Record<string, unknown>;
  };
  persistTelemetryFor?: { messageId: string };
  /**
   * Identifier used to scope the run's logger. When present, every log entry
   * emitted under the runtime tree carries `{ runId }` — entrypoints can use
   * this binding to mirror the trail to a per-run file sink (see
   * `src/platform/log/file-sink.ts`).
   */
  runId?: string;
}

type RuntimeErrorState = {
  cause: unknown;
  error: AgentError;
};

export async function runAgent(args: RunAgentArgs): Promise<AgentRunResult> {
  const { input, config, persistTelemetryFor } = args;
  const runId = args.runId ?? `${input.projectId}-${Date.now()}`;
  const deps: AgentRuntimeDeps = {
    ...args.deps,
    logger: args.deps.logger.child({ scope: "run", bindings: { runId } }),
  };

  const runState = createRunState();
  const thoughts: Thought[] = [];
  const cumulativeUsage: UsageTotals = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  const previousMessages: ModelMessage[] = (input.previousMessages ?? []).map(
    (m) => ({ role: m.role, content: m.content })
  );

  const plan = await planRun({
    input: {
      userPrompt: input.prompt,
      previousMessages,
      plannerSystemPrompt: config.plannerSystemPrompt,
      providerCacheOptions: config.providerCacheOptions,
    },
    deps,
  });
  runState.plan = plan;

  let stepsCount = 0;
  let runtimeError: RuntimeErrorState | undefined;
  const ladder = deps.modelGateway.listExecutorModelIds();

  if (plan.requiresCoding) {
    // Each ladder rung is itself a route with OpenRouter fallback models
    // configured at the gateway. By the time `executeRun` throws a retryable
    // error here, OpenRouter has already exhausted the in-route fallback
    // list, so advancing this ladder means "the entire route failed,"
    // not "the primary model failed." See docs/plans/archive/openrouter-model-route-fallbacks.md.
    for (let i = 0; i < ladder.length; i++) {
      const modelId = ladder[i];
      let descriptorString: string;
      try {
        const desc = deps.modelGateway.describeModel(modelId);
        descriptorString = `${desc.provider}:${desc.model}`;
      } catch (err) {
        // Invalid ladder slots are skipped so later configured models can still run.
        deps.logger.warn({
          event: "ladder slot unavailable",
          metadata: { modelId, err: String(err) },
        });
        runtimeError = { cause: err, error: classifyAgentError(err) };
        continue;
      }

      await deps.eventSink.emit({
        type: AgentRuntimeEventType.ExecutorAttemptStarted,
        attempt: i + 1,
        model: descriptorString,
      });

      const outcome = await executeRun({
        input: {
          userPrompt: input.prompt,
          previousMessages,
          plan,
          runState,
          thoughts,
          cumulativeUsage,
          buildExecutorSystemPrompt: config.buildExecutorSystemPrompt,
          providerCacheOptions: config.providerCacheOptions,
          modelId,
        },
        deps: {
          modelGateway: deps.modelGateway,
          sandboxGateway: deps.sandboxGateway,
          toolFactory: deps.toolFactory,
          eventSink: deps.eventSink,
          logger: deps.logger,
          persistTelemetrySnapshot: persistTelemetryFor
            ? async (payload) => {
                await persistTelemetryWith(
                  deps.telemetryStore,
                  persistTelemetryFor.messageId,
                  payload
                );
              }
            : undefined,
        },
      });
      stepsCount = outcome.stepsCount;

      if (outcome.error) {
        const error = deps.modelGateway.classifyError(outcome.error);
        runtimeError = { cause: outcome.error, error };
        await deps.eventSink.emit({
          type: AgentRuntimeEventType.ExecutorAttemptFailed,
          attempt: i + 1,
          error,
          category: error.category,
          retryable: error.retryable,
          errorMessage: error.message,
        });
        if (!error.retryable) {
          break;
        }
        continue;
      }

      runtimeError = undefined;

      if (!outcome.escalated) {
        await deps.eventSink.emit({
          type: AgentRuntimeEventType.ExecutorAccepted,
          attempt: i + 1,
        });
        break;
      }

      await deps.eventSink.emit({
        type: AgentRuntimeEventType.ExecutorEscalated,
        attempt: i + 1,
        reason: outcome.reason,
      });
    }
  }

  const error = runtimeError?.error;
  const lastErrorMessage = runtimeError
    ? agentErrorMessage(runtimeError.cause)
    : null;

  if (persistTelemetryFor) {
    const payload = buildTelemetry(runState, stepsCount, cumulativeUsage);
    try {
      await persistTelemetryWith(
        deps.telemetryStore,
        persistTelemetryFor.messageId,
        payload
      );
    } catch (err) {
      // best-effort final telemetry write — the run result is still returned to the caller.
      deps.logger.warn({
        event: "telemetry persist failed",
        metadata: { err: String(err) },
      });
    }
  }

  await deps.eventSink.emit({
    type: AgentRuntimeEventType.AgentFinished,
    stepsCount,
    usage: cumulativeUsage,
    finalOutput: runState.finalOutput,
    error,
    lastErrorMessage,
  });

  return {
    finalOutput: runState.finalOutput,
    stepsCount,
    usage: cumulativeUsage,
    error,
    lastErrorMessage,
    runState: freezeRunState(runState),
  };
}
