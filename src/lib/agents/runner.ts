import { classifyProviderError } from "@/lib/errors";
import {
  EXECUTOR_LADDER,
  resolveSpec,
  type ResolvedModelConfig,
} from "@/lib/models";
import { runExecutorOnce } from "./executor";
import {
  AgentRuntimeEventType,
  type ExecuteOutcome,
  type RunCodingOpts,
} from "./runtime";

export async function runCodingAgentWithEscalation(
  opts: RunCodingOpts
): Promise<ExecuteOutcome> {
  let stepsCount = 0;
  let lastError: unknown;

  for (let i = 0; i < EXECUTOR_LADDER.length; i++) {
    const spec = EXECUTOR_LADDER[i];
    let modelConfig: ResolvedModelConfig;
    try {
      modelConfig = resolveSpec(spec);
    } catch (err) {
      opts.log.warn({
        event: "ladder slot unavailable",
        metadata: { spec, err: String(err) },
      });
      lastError = err;
      continue;
    }

    await opts.hooks.emit?.({
      type: AgentRuntimeEventType.ExecutorAttemptStarted,
      attempt: i + 1,
      model: `${modelConfig.provider}:${modelConfig.model}`,
    });

    const outcome = await runExecutorOnce(spec, modelConfig, opts);
    stepsCount = outcome.stepsCount;

    if (outcome.error) {
      const classified = classifyProviderError(outcome.error);
      lastError = outcome.error;
      await opts.hooks.emit?.({
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
      await opts.hooks.emit?.({
        type: AgentRuntimeEventType.ExecutorAccepted,
        attempt: i + 1,
      });
      break;
    }

    await opts.hooks.emit?.({
      type: AgentRuntimeEventType.ExecutorEscalated,
      attempt: i + 1,
      reason: outcome.reason,
    });
  }

  const lastErrorMessage =
    lastError === undefined
      ? null
      : lastError instanceof Error
        ? lastError.message
        : String(lastError);

  const executeOutcome: ExecuteOutcome = {
    runState: opts.runState,
    stepsCount,
    usage: opts.cumulativeUsage,
    lastErrorMessage,
  };

  await opts.hooks.emit?.({
    type: AgentRuntimeEventType.AgentFinished,
    stepsCount,
    usage: opts.cumulativeUsage,
    finalOutput: opts.runState.finalOutput,
    lastErrorMessage,
  });

  return executeOutcome;
}
