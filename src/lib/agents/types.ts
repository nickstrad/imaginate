import type {
  FinalOutput,
  PlanOutput,
  VerificationKind,
  VerificationRecord,
} from "./schemas";

export type VerificationToolKind = Extract<
  VerificationKind,
  "build" | "test" | "lint"
>;

export type RunState = {
  filesWritten: Record<string, string>;
  filesRead: string[];
  commandsRun: Array<{ command: string; success: boolean }>;
  verification: VerificationRecord[];
  plan?: PlanOutput;
  finalOutput?: FinalOutput;
  totalAttempts: number;
  escalatedTo: string | null;
};

export type EscalateDecision = {
  escalate: boolean;
  reason?: import("./decisions").EscalateReason;
};

export type Edit = {
  find: string;
  replace: string;
  expectedOccurrences: number;
};

export type EditResult =
  | { ok: true; content: string; count: number }
  | { ok: false; error: string };

export type UsageTotals = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type PersistedTelemetry = {
  steps: number;
  filesRead: number;
  filesWritten: number;
  commandsRun: number;
  buildSucceeded: boolean;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type TelemetryPayload = PersistedTelemetry & {
  plannerTaskType: string | null;
  totalAttempts: number;
  escalatedTo: string | null;
  verificationSuccessCount: number;
  verificationFailureCount: number;
};

export interface TelemetryStore {
  upsert(args: {
    where: { messageId: string };
    create: PersistedTelemetry & { messageId: string };
    update: PersistedTelemetry;
  }): Promise<unknown>;
}
