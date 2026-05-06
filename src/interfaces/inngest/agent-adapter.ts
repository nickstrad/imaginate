import {
  AgentRuntimeEventType,
  createAiSdkModelGateway,
  createAiSdkToolFactory,
  createE2bSandboxGateway,
  createPrismaMessageStore,
  createPrismaTelemetryStore,
  type AgentLogger,
  type AgentRuntimeDeps,
  type AgentRuntimeEvent,
} from "@/agent";
import type { MessageWorkflow } from "@/features/messages";
import type { Logger } from "@/platform/log";
import type { Thought, ThoughtToolCall } from "@/shared/schemas/thought";

type RuntimeLogEntry = {
  level: "info" | "warn";
  event: string;
  metadata?: Record<string, unknown>;
};

function runtimeLogEntry(event: AgentRuntimeEvent): RuntimeLogEntry | null {
  switch (event.type) {
    case AgentRuntimeEventType.PlannerStarted: {
      return { level: "info", event: "planner started" };
    }
    case AgentRuntimeEventType.PlannerFinished: {
      return {
        level: "info",
        event: "planner finished",
        metadata: {
          taskType: event.plan.taskType,
          requiresCoding: event.plan.requiresCoding,
        },
      };
    }
    case AgentRuntimeEventType.PlannerFailed: {
      return {
        level: "warn",
        event: "planner failed",
        metadata: { error: event.error },
      };
    }
    case AgentRuntimeEventType.ExecutorAttemptStarted: {
      return {
        level: "info",
        event: "executor attempt",
        metadata: { attempt: event.attempt, model: event.model },
      };
    }
    case AgentRuntimeEventType.ToolCallRequested: {
      return {
        level: "info",
        event: "tool call requested",
        metadata: {
          callId: event.callId,
          stepIndex: event.stepIndex,
          toolName: event.toolName,
        },
      };
    }
    case AgentRuntimeEventType.ToolCallCompleted: {
      return {
        level: event.ok ? "info" : "warn",
        event: "tool call completed",
        metadata: {
          callId: event.callId,
          stepIndex: event.stepIndex,
          toolName: event.toolName,
          ok: event.ok,
          errorCategory: event.ok ? undefined : event.error.category,
        },
      };
    }
    case AgentRuntimeEventType.ExecutorAttemptFailed: {
      return {
        level: "warn",
        event: "executor attempt failed",
        metadata: {
          attempt: event.attempt,
          category: event.error.category,
          code: event.error.code,
          retryable: event.error.retryable,
        },
      };
    }
    case AgentRuntimeEventType.ExecutorEscalated: {
      return {
        level: "info",
        event: "executor escalated",
        metadata: { attempt: event.attempt, reason: event.reason },
      };
    }
    case AgentRuntimeEventType.ExecutorAccepted: {
      return {
        level: "info",
        event: "executor accepted",
        metadata: { attempt: event.attempt },
      };
    }
    case AgentRuntimeEventType.AgentFinished: {
      return {
        level: "info",
        event: "agent finished",
        metadata: {
          stepsCount: event.stepsCount,
          totalTokens: event.usage.totalTokens,
          status: event.finalOutput?.status,
          hasError: event.error !== undefined,
          errorCategory: event.error?.category,
        },
      };
    }
    case AgentRuntimeEventType.ExecutorStepFinished: {
      return null;
    }
  }
}

type ThoughtToolCallCompletion = NonNullable<ThoughtToolCall["completion"]>;

function durationPart(durationMs: number | undefined): { durationMs?: number } {
  return typeof durationMs === "number" ? { durationMs } : {};
}

function toJsonCompatible(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function completionFromEvent(
  event: Extract<
    AgentRuntimeEvent,
    { type: typeof AgentRuntimeEventType.ToolCallCompleted }
  >
): ThoughtToolCallCompletion {
  if (event.ok) {
    return {
      ok: true,
      ...durationPart(event.durationMs),
      result: toJsonCompatible(event.result),
    };
  }
  return {
    ok: false,
    ...durationPart(event.durationMs),
    error: event.error,
  };
}

function projectThoughtsWithCompletions(
  thoughts: Thought[],
  completions: ReadonlyMap<string, ThoughtToolCallCompletion>
): Thought[] {
  if (completions.size === 0) {
    return thoughts;
  }
  return thoughts.map((thought) => ({
    ...thought,
    toolCalls: thought.toolCalls?.map((toolCall) => {
      const completion = completions.get(toolCall.callId);
      return completion ? { ...toolCall, completion } : toolCall;
    }),
  }));
}

export function logAgentRuntimeEvent(
  log: Logger,
  event: AgentRuntimeEvent
): void {
  const entry = runtimeLogEntry(event);
  if (!entry) {
    return;
  }
  log[entry.level]({ event: entry.event, metadata: entry.metadata });
}

export function createAgentLoggerFromLogger(log: Logger): AgentLogger {
  return {
    debug: (input) => log.debug(input),
    info: (input) => log.info(input),
    warn: (input) => log.warn(input),
    error: (input) => log.error(input),
    child: ({ scope, bindings }) =>
      createAgentLoggerFromLogger(log.child({ scope, bindings })),
  };
}

export function buildAgentDeps(input: {
  sandboxId: string;
  log: Logger;
  emit: (event: AgentRuntimeEvent) => void | Promise<void>;
}): AgentRuntimeDeps {
  return {
    modelGateway: createAiSdkModelGateway(),
    sandboxGateway: createE2bSandboxGateway({ sandboxId: input.sandboxId }),
    toolFactory: createAiSdkToolFactory(),
    messageStore: createPrismaMessageStore(),
    telemetryStore: createPrismaTelemetryStore(),
    eventSink: { emit: input.emit },
    logger: createAgentLoggerFromLogger(input.log),
  };
}

export function makePersistedThoughtSink(args: {
  log: Logger;
  persistedMessageId: string;
  thoughts: Thought[];
  messageWorkflow: MessageWorkflow;
}): (event: AgentRuntimeEvent) => Promise<void> {
  const { log, persistedMessageId, thoughts, messageWorkflow } = args;
  const toolCallCompletions = new Map<string, ThoughtToolCallCompletion>();
  return async (event) => {
    logAgentRuntimeEvent(log, event);
    if (event.type === AgentRuntimeEventType.ToolCallCompleted) {
      toolCallCompletions.set(event.callId, completionFromEvent(event));
    }
    if (event.type === AgentRuntimeEventType.ExecutorStepFinished) {
      // The agent runtime is the single source of truth for the `thoughts`
      // array — `execute-run.ts` already appends each step before emitting
      // ExecutorStepFinished. The sink only persists the current snapshot;
      // pushing here would double-record every step.
      const projectedThoughts = projectThoughtsWithCompletions(
        thoughts,
        toolCallCompletions
      );
      await messageWorkflow.recordThoughts({
        messageId: persistedMessageId,
        thoughts: projectedThoughts,
      });
    }
  };
}
