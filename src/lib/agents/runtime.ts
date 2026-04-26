import type { generateText, ModelMessage } from "ai";
import type { Sandbox } from "@e2b/code-interpreter";
import type { Logger } from "@/lib/log";
import type { Thought } from "@/lib/schemas/thought";
import type { FinalOutput, PlanOutput } from "./schemas";
import type { RunState, TelemetryPayload, UsageTotals } from "./types";
import { EscalateReason } from "./decisions";

export { EscalateReason };

export type SandboxLike = Awaited<ReturnType<typeof Sandbox.create>>;

export type GenerateTextFn = typeof generateText;

export type AgentStepSnapshot = {
  stepIndex: number;
  thought: Thought;
  finishReason: string | undefined;
};

export type ExecutorAttemptResult = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any;
  stepsCount: number;
  escalated: boolean;
  reason?: EscalateReason;
  error?: unknown;
};

export type ExecuteOutcome = {
  runState: RunState;
  stepsCount: number;
  usage: UsageTotals;
  lastErrorMessage: string | null;
};

export const AgentRuntimeEventType = {
  PlannerStarted: "planner.started",
  PlannerFinished: "planner.finished",
  PlannerFailed: "planner.failed",
  ExecutorAttemptStarted: "executor.attempt.started",
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
      type: typeof AgentRuntimeEventType.ExecutorStepFinished;
      step: AgentStepSnapshot;
    }
  | {
      type: typeof AgentRuntimeEventType.ExecutorAttemptFailed;
      attempt: number;
      category: string;
      retryable: boolean;
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
      lastErrorMessage: string | null;
    };

export type AgentRuntimeBaseHooks = {
  emit?: (event: AgentRuntimeEvent) => void | Promise<void>;
};

export type AgentRuntimeHooks = AgentRuntimeBaseHooks & {
  getSandbox: () => Promise<SandboxLike>;
  persistTelemetry?: (payload: TelemetryPayload) => void | Promise<void>;
};

export type RunCodingOpts = {
  thoughts: Thought[];
  cumulativeUsage: UsageTotals;
  plan: PlanOutput;
  runState: RunState;
  previousMessages: ModelMessage[];
  userPrompt: string;
  log: Logger;
  hooks: AgentRuntimeHooks;
  generateText?: GenerateTextFn;
};
