import type { RunState } from "./agent-config";

/** Extracts visible text from an AI SDK step/result object. */
export function stepTextOf(src: unknown): string {
  if (!src || typeof src !== "object") {
    return "";
  }
  const s = src as { text?: unknown; content?: unknown };
  if (typeof s.text === "string" && s.text) {
    return s.text;
  }
  const parts = Array.isArray(s.content) ? s.content : [];
  let out = "";
  for (const p of parts) {
    if (p && typeof p === "object") {
      const part = p as { type?: unknown; text?: unknown };
      if (part.type === "text" && typeof part.text === "string") {
        out += part.text;
      }
    }
  }
  return out;
}

export const TASK_SUMMARY_RE = /<task_summary>([\s\S]*?)<\/task_summary>/;

/** Pure helper: pulls a `<task_summary>` block from any candidate text. */
export function extractTaskSummary(texts: Iterable<string>): string | null {
  for (const text of texts) {
    if (!text) {
      continue;
    }
    const m = text.match(TASK_SUMMARY_RE);
    if (m) {
      return m[1].trim();
    }
  }
  return null;
}

export type EscalateDecision = { escalate: boolean; reason?: string };

/**
 * Decides whether the executor should escalate to the next ladder rung.
 *
 * Why: keep the heuristic in one pure place so each branch can be unit tested
 * and the executor loop in functions.ts stays declarative.
 */
export function shouldEscalate(
  runState: RunState,
  result: unknown,
): EscalateDecision {
  if (runState.finalOutput) {
    if (runState.finalOutput.status === "failed") {
      return { escalate: true, reason: "finalize:failed" };
    }
    if (runState.finalOutput.status === "partial") {
      return { escalate: true, reason: "finalize:partial" };
    }
    return { escalate: false };
  }

  const text = stepTextOf(result) || "";
  const lower = text.toLowerCase();
  if (!text.trim()) {
    return { escalate: true, reason: "empty_output" };
  }
  if (
    lower.includes("todo") ||
    lower.includes("placeholder") ||
    lower.includes("not implemented")
  ) {
    return { escalate: true, reason: "stub_language" };
  }

  const wrote = Object.keys(runState.filesWritten).length > 0;
  const verified = runState.verification.some((v) => v.success);
  if (wrote && !verified) {
    return { escalate: true, reason: "wrote_without_verify" };
  }
  if (!wrote) {
    return { escalate: true, reason: "no_writes" };
  }

  return { escalate: false };
}
