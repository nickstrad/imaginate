import { PROVIDER_ERROR_RULES } from "./constants";
import type { ClassifiedProviderError } from "./types";

export function classifyProviderError(err: unknown): ClassifiedProviderError {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : JSON.stringify(err);
  const lower = raw.toLowerCase();

  for (const rule of PROVIDER_ERROR_RULES) {
    if (rule.needles.some((n) => lower.includes(n))) {
      return {
        category: rule.category,
        retryable: rule.retryable,
        raw,
        userMessage: `${rule.prefix}: ${raw}`,
      };
    }
  }

  return {
    category: "unknown",
    retryable: false,
    raw,
    userMessage: `Provider error: ${raw}`,
  };
}
