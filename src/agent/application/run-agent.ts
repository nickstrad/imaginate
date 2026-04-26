import {
  buildTelemetry,
  createRunState,
  persistTelemetryWith,
} from "../domain";
import { AgentRuntimeEventType } from "../domain/events";
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
}

export async function runAgent(args: RunAgentArgs): Promise<AgentRunResult> {
  const { input, deps, config, persistTelemetryFor } = args;

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
  let lastError: unknown;
  const ladder = deps.modelGateway.listExecutorModelIds();

  if (plan.requiresCoding) {
    for (let i = 0; i < ladder.length; i++) {
      const modelId = ladder[i];
      let descriptorString: string;
      try {
        const desc = deps.modelGateway.describeModel(modelId);
        descriptorString = `${desc.provider}:${desc.model}`;
      } catch (err) {
        deps.logger.warn({
          event: "ladder slot unavailable",
          metadata: { modelId, err: String(err) },
        });
        lastError = err;
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
        const classified = deps.modelGateway.classifyError(outcome.error);
        lastError = outcome.error;
        await deps.eventSink.emit({
          type: AgentRuntimeEventType.ExecutorAttemptFailed,
          attempt: i + 1,
          category: classified.category,
          retryable: classified.retryable,
        });
        if (!classified.retryable) {
          break;
        }
        continue;
      }

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

  const lastErrorMessage =
    lastError === undefined
      ? null
      : lastError instanceof Error
        ? lastError.message
        : String(lastError);

  if (persistTelemetryFor) {
    const payload = buildTelemetry(runState, stepsCount, cumulativeUsage);
    try {
      await persistTelemetryWith(
        deps.telemetryStore,
        persistTelemetryFor.messageId,
        payload
      );
    } catch (err) {
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
    lastErrorMessage,
  });

  return {
    finalOutput: runState.finalOutput,
    stepsCount,
    usage: cumulativeUsage,
    lastErrorMessage,
  };
}
