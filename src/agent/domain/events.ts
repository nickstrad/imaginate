// Runtime event contract. Lives in domain because it is a pure type
// declaration consumed by application code, ports (event-sink), and
// adapters alike. application/events.ts re-exports this so consumers
// can keep using `@/agent/application` for the public surface.

import type {
  AgentStepSnapshot,
  FinalOutput,
  PlanOutput,
  UsageTotals,
} from "./types";
import type { AgentError, AgentErrorCategory } from "./errors";

export const AgentRuntimeEventType = {
  PlannerStarted: "planner.started",
  PlannerFinished: "planner.finished",
  PlannerFailed: "planner.failed",
  ExecutorAttemptStarted: "executor.attempt.started",
  ToolCallRequested: "tool.call.requested",
  ToolCallCompleted: "tool.call.completed",
  ExecutorStepFinished: "executor.step.finished",
  ExecutorAttemptFailed: "executor.attempt.failed",
  ExecutorEscalated: "executor.escalated",
  ExecutorAccepted: "executor.accepted",
  AgentFinished: "agent.finished",
} as const;

export type AgentRuntimeEventType =
  (typeof AgentRuntimeEventType)[keyof typeof AgentRuntimeEventType];

export type AgentRuntimeEvent =
  | { type: typeof AgentRuntimeEventType.PlannerStarted }
  | { type: typeof AgentRuntimeEventType.PlannerFinished; plan: PlanOutput }
  | { type: typeof AgentRuntimeEventType.PlannerFailed; error: string }
  | {
      type: typeof AgentRuntimeEventType.ExecutorAttemptStarted;
      attempt: number;
      model: string;
    }
  | {
      type: typeof AgentRuntimeEventType.ToolCallRequested;
      callId: string;
      stepIndex: number;
      toolName: string;
      args: Record<string, unknown>;
    }
  | {
      type: typeof AgentRuntimeEventType.ToolCallCompleted;
      callId: string;
      stepIndex: number;
      toolName: string;
      ok: true;
      durationMs?: number;
      result: unknown;
    }
  | {
      type: typeof AgentRuntimeEventType.ToolCallCompleted;
      callId: string;
      stepIndex: number;
      toolName: string;
      ok: false;
      durationMs?: number;
      error: AgentError;
    }
  | {
      type: typeof AgentRuntimeEventType.ExecutorStepFinished;
      step: AgentStepSnapshot;
      toolCallIds: string[];
    }
  | {
      type: typeof AgentRuntimeEventType.ExecutorAttemptFailed;
      attempt: number;
      error: AgentError;
      category: AgentErrorCategory;
      retryable: boolean;
      errorMessage: string;
    }
  | {
      type: typeof AgentRuntimeEventType.ExecutorEscalated;
      attempt: number;
      reason?: string;
    }
  | {
      type: typeof AgentRuntimeEventType.ExecutorAccepted;
      attempt: number;
    }
  | {
      type: typeof AgentRuntimeEventType.AgentFinished;
      stepsCount: number;
      usage: UsageTotals;
      finalOutput: FinalOutput | undefined;
      error?: AgentError;
      lastErrorMessage: string | null;
    };
