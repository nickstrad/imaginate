// Structural types for the agent runtime. Chunk 03 replaces these with the
// canonical Zod-derived schemas; until then they mirror existing shapes so
// ports and application code can be authored without crossing layers.

export type PlanTaskType =
  | "code_change"
  | "new_feature"
  | "refactor"
  | "bug_fix"
  | "question"
  | "explain"
  | "other";

export type PlanVerificationMode =
  | "tsc"
  | "tsc+tests"
  | "tsc+lint"
  | "manual"
  | "none";

export interface PlanOutput {
  requiresCoding: boolean;
  taskType: PlanTaskType;
  targetFiles: string[];
  verification: PlanVerificationMode;
  notes: string;
  answer?: string;
}

export type VerificationKind = "build" | "test" | "lint" | "dev" | "command";

export interface VerificationRecord {
  kind: VerificationKind;
  command: string;
  success: boolean;
}

export type FinalStatus = "success" | "partial" | "failed";

export interface FinalOutput {
  status: FinalStatus;
  title: string;
  summary: string;
  verification: VerificationRecord[];
  nextSteps: string[];
}

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

export interface AgentRunInput {
  prompt: string;
  projectId: string;
  previousMessages?: ChatMessage[];
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AgentRunResult {
  finalOutput: FinalOutput | undefined;
  stepsCount: number;
  usage: UsageTotals;
  lastErrorMessage: string | null;
}
