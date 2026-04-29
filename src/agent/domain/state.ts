import { BUILD_RE, LINT_RE, TEST_RE } from "./constants";
import type { RunState, VerificationKind } from "./types";

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

export function freezeRunState(runState: RunState): Readonly<RunState> {
  return deepFreeze(runState);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Object.keys(value as object)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

export function inferVerificationKind(
  command: string
): VerificationKind | null {
  const c = command.trim();
  if (BUILD_RE.test(c)) {
    return "build";
  }
  if (TEST_RE.test(c)) {
    return "test";
  }
  if (LINT_RE.test(c)) {
    return "lint";
  }
  return null;
}
