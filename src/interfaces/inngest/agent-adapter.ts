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
import {
  recordAssistantThoughts,
  type MessageRepository,
} from "@/features/messages";
import type { Logger } from "@/platform/log";
import type { Thought } from "@/shared/schemas/thought";

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
    case AgentRuntimeEventType.ExecutorAttemptFailed: {
      return {
        level: "warn",
        event: "executor attempt failed",
        metadata: {
          attempt: event.attempt,
          category: event.category,
          retryable: event.retryable,
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
          hasError: event.lastErrorMessage !== null,
        },
      };
    }
    case AgentRuntimeEventType.ExecutorStepFinished: {
      return null;
    }
  }
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
  messageRepository: MessageRepository;
}): (event: AgentRuntimeEvent) => Promise<void> {
  const { log, persistedMessageId, thoughts, messageRepository } = args;
  return async (event) => {
    logAgentRuntimeEvent(log, event);
    if (event.type === AgentRuntimeEventType.ExecutorStepFinished) {
      // Mirror the AI-SDK Thought shape into the Inngest persistence schema.
      thoughts.push(event.step.thought as Thought);
      await recordAssistantThoughts(
        {
          messageId: persistedMessageId,
          thoughts,
        },
        {
          repository: messageRepository,
        }
      );
    }
  };
}
