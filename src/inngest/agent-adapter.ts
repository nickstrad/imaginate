import {
  AgentRuntimeEventType,
  persistTelemetry,
  type AgentRuntimeEvent,
  type AgentRuntimeHooks,
} from "@/lib/agents";
import { prisma } from "@/lib/db";
import type { Logger } from "@/lib/log";
import { getSandbox } from "@/lib/sandbox";
import { thoughtsToPrismaJson, type Thought } from "@/lib/schemas/thought";

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

export function buildAgentHooks(args: {
  sandboxId: string;
  persistedMessageId: string;
  thoughts: Thought[];
  log: Logger;
}): AgentRuntimeHooks {
  const { sandboxId, persistedMessageId, thoughts, log } = args;
  return {
    getSandbox: () => getSandbox(sandboxId),
    persistTelemetry: async (payload) => {
      await persistTelemetry(persistedMessageId, payload);
    },
    emit: async (event) => {
      logAgentRuntimeEvent(log, event);

      if (event.type === AgentRuntimeEventType.ExecutorStepFinished) {
        await prisma.message.update({
          where: { id: persistedMessageId },
          data: { thoughts: thoughtsToPrismaJson(thoughts) },
        });
      }
    },
  };
}
