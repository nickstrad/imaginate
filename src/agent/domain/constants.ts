import type { VerificationToolKind } from "./types";

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

export const TASK_SUMMARY_RE = /<task_summary>([\s\S]*?)<\/task_summary>/;

export const BUILD_RE = /\btsc\b[^|]*--noEmit\b|\bnext\s+build\b|\btsc\b\s*$/;
export const TEST_RE = /\b(vitest|jest|npm\s+test|pnpm\s+test|yarn\s+test)\b/;
export const LINT_RE = /\b(eslint|next\s+lint|npm\s+run\s+lint)\b/;

export const DEFAULT_VERIFICATION_COMMAND: Record<
  VerificationToolKind,
  string
> = {
  build: "cd /home/user && npx tsc --noEmit",
  test: "cd /home/user && npm test --silent",
  lint: "cd /home/user && npm run lint --silent",
};
