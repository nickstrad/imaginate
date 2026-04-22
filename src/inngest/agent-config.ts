import type {
  FinalOutput,
  PlanOutput,
  VerificationKind,
  VerificationRecord,
} from "./agent-schemas";

export const AGENT_CONFIG: {
  maxOutputTokens?: number;
  maxSteps?: number;
  maxFileReads?: number;
  maxWrites?: number;
  maxTerminalRuns?: number;
  maxStdoutChars?: number;
  commandTimeoutMs?: number;
  patchBytesCap?: number;
} = {
  maxOutputTokens: undefined,
  maxSteps: undefined,
  maxFileReads: undefined,
  maxWrites: undefined,
  maxTerminalRuns: undefined,
  maxStdoutChars: undefined,
  commandTimeoutMs: undefined,
  patchBytesCap: 60_000,
};

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

export function createRunState(): RunState {
  return {
    filesWritten: {},
    filesRead: [],
    commandsRun: [],
    verification: [],
    plan: undefined,
    finalOutput: undefined,
    totalAttempts: 0,
    escalatedTo: null,
  };
}

export function markVerification(
  runState: RunState,
  kind: VerificationKind,
  command: string,
  success: boolean
) {
  runState.verification.push({ kind, command, success });
}

export function hasSuccessfulVerification(runState: RunState): boolean {
  return runState.verification.some((v) => v.success);
}

const BUILD_RE = /\btsc\b[^|]*--noEmit\b|\bnext\s+build\b|\btsc\b\s*$/;
const TEST_RE = /\b(vitest|jest|npm\s+test|pnpm\s+test|yarn\s+test)\b/;
const LINT_RE = /\b(eslint|next\s+lint|npm\s+run\s+lint)\b/;

export function inferVerificationKind(
  command: string
): VerificationKind | null {
  const c = command.trim();
  if (BUILD_RE.test(c)) return "build";
  if (TEST_RE.test(c)) return "test";
  if (LINT_RE.test(c)) return "lint";
  return null;
}
