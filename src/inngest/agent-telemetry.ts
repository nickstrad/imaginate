import { prisma } from "@/db";
import type { RunState } from "./agent-config";

export type TelemetryPayload = {
  steps: number;
  filesRead: number;
  filesWritten: number;
  commandsRun: number;
  buildSucceeded: boolean;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
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

export function buildTelemetry(
  runState: RunState,
  steps: number,
  usage: UsageTotals
): TelemetryPayload {
  const nullIfZero = (n: number) => (n === 0 ? null : n);
  return {
    steps,
    filesRead: runState.filesRead.length,
    filesWritten: Object.keys(runState.filesWritten).length,
    commandsRun: runState.commandsRun.length,
    buildSucceeded: runState.buildSucceeded,
    promptTokens: nullIfZero(usage.promptTokens),
    completionTokens: nullIfZero(usage.completionTokens),
    totalTokens: nullIfZero(usage.totalTokens),
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
  return prisma.telemetry.upsert({
    where: { messageId },
    create: { messageId, ...payload },
    update: payload,
  });
}
