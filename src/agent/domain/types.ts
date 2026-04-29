// Canonical domain types for the agent runtime. The Zod-derived types come
// from `./schemas`; this module re-exports them and adds the structural
// types used by application code and ports.

import type {
  FinalOutput,
  FinalStatus,
  PlanOutput,
  PlanTaskType,
  VerificationKind,
  VerificationRecord,
} from "./schemas";

export type {
  FinalOutput,
  FinalStatus,
  PlanOutput,
  PlanTaskType,
  VerificationKind,
  VerificationRecord,
};

export type PlanVerificationMode = PlanOutput["verification"];

export type VerificationToolKind = Extract<
  VerificationKind,
  "build" | "test" | "lint"
>;

export interface ThoughtToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

export interface Thought {
  stepIndex: number;
  text: string;
  toolCalls?: ThoughtToolCall[];
  toolResults?: string[];
  reasoningText?: string;
  finishReason?: string;
}

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AgentStepSnapshot {
  stepIndex: number;
  thought: Thought;
  finishReason: string | undefined;
}

export interface PersistedTelemetry {
  steps: number;
  filesRead: number;
  filesWritten: number;
  commandsRun: number;
  buildSucceeded: boolean;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface TelemetryPayload extends PersistedTelemetry {
  plannerTaskType: string | null;
  totalAttempts: number;
  escalatedTo: string | null;
  verificationSuccessCount: number;
  verificationFailureCount: number;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AgentRunInput {
  prompt: string;
  projectId: string;
  previousMessages?: ChatMessage[];
}

export interface AgentRunResult {
  finalOutput: FinalOutput | undefined;
  stepsCount: number;
  usage: UsageTotals;
  lastErrorMessage: string | null;
  runState: Readonly<RunState>;
}

export interface RunState {
  filesWritten: Record<string, string>;
  filesRead: string[];
  commandsRun: Array<{ command: string; success: boolean }>;
  verification: VerificationRecord[];
  plan?: PlanOutput;
  finalOutput?: FinalOutput;
  totalAttempts: number;
  escalatedTo: string | null;
}

export const EscalateReason = {
  FinalizeFailed: "finalize:failed",
  FinalizePartial: "finalize:partial",
  EmptyOutput: "empty_output",
  StubLanguage: "stub_language",
  WroteWithoutVerify: "wrote_without_verify",
  NoWrites: "no_writes",
  Exception: "exception",
} as const;

export type EscalateReason =
  (typeof EscalateReason)[keyof typeof EscalateReason];

export interface EscalateDecision {
  escalate: boolean;
  reason?: EscalateReason;
}

export interface Edit {
  find: string;
  replace: string;
  expectedOccurrences: number;
}

export type EditResult =
  | { ok: true; content: string; count: number }
  | { ok: false; error: string };
