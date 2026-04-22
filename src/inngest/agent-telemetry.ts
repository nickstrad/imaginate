import { prisma } from "@/db";
import type { RunState } from "./agent-config";

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

export type UsageTotals = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

const toNum = (v: unknown): number => (typeof v === "number" ? v : 0);

export function readUsage(usage: unknown): UsageTotals {
  const u = (usage ?? {}) as Record<string, unknown>;
  return {
    promptTokens: toNum(u.promptTokens ?? u.inputTokens),
    completionTokens: toNum(u.completionTokens ?? u.outputTokens),
    totalTokens: toNum(u.totalTokens),
  };
}

function summarizeVerification(runState: RunState) {
  let success = 0;
  let failure = 0;
  let buildSucceeded = false;
  for (const v of runState.verification) {
    if (v.success) {
      success++;
      if (v.kind === "build") buildSucceeded = true;
    } else {
      failure++;
    }
  }
  return { success, failure, buildSucceeded };
}

export function buildTelemetry(
  runState: RunState,
  steps: number,
  usage: UsageTotals
): TelemetryPayload {
  const nullIfZero = (n: number) => (n === 0 ? null : n);
  const v = summarizeVerification(runState);
  return {
    steps,
    filesRead: runState.filesRead.length,
    filesWritten: Object.keys(runState.filesWritten).length,
    commandsRun: runState.commandsRun.length,
    buildSucceeded: v.buildSucceeded,
    promptTokens: nullIfZero(usage.promptTokens),
    completionTokens: nullIfZero(usage.completionTokens),
    totalTokens: nullIfZero(usage.totalTokens),
    plannerTaskType: runState.plan?.taskType ?? null,
    totalAttempts: runState.totalAttempts,
    escalatedTo: runState.escalatedTo,
    verificationSuccessCount: v.success,
    verificationFailureCount: v.failure,
  };
}

export function extractTelemetry(
  result: { steps?: unknown[]; usage?: Record<string, unknown> } | undefined,
  runState: RunState
): TelemetryPayload {
  const steps = Array.isArray(result?.steps) ? result!.steps!.length : 0;
  return buildTelemetry(runState, steps, readUsage(result?.usage));
}

export async function persistTelemetry(
  messageId: string,
  payload: TelemetryPayload
) {
  const db: PersistedTelemetry = {
    steps: payload.steps,
    filesRead: payload.filesRead,
    filesWritten: payload.filesWritten,
    commandsRun: payload.commandsRun,
    buildSucceeded: payload.buildSucceeded,
    promptTokens: payload.promptTokens,
    completionTokens: payload.completionTokens,
    totalTokens: payload.totalTokens,
  };
  return prisma.telemetry.upsert({
    where: { messageId },
    create: { messageId, ...db },
    update: db,
  });
}
