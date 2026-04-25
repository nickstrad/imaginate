import type { ProviderErrorRule } from "./types";

export const PROVIDER_ERROR_RULES: ProviderErrorRule[] = [
  {
    category: "credit",
    retryable: false,
    prefix: "Provider account limit reached",
    needles: ["credit", "balance", "quota", "insufficient"],
  },
  {
    category: "rate_limit",
    retryable: true,
    prefix: "Provider rate limit exceeded",
    needles: ["rate limit", "429", "too many requests"],
  },
  {
    category: "auth",
    retryable: false,
    prefix: "Provider authentication failed",
    needles: ["unauthorized", "401", "api key", "authentication"],
  },
  {
    category: "timeout",
    retryable: true,
    prefix: "Provider timed out",
    needles: ["timeout", "etimedout"],
  },
  {
    category: "connection",
    retryable: true,
    prefix: "Provider connection error",
    needles: ["econnreset", "econnrefused", "enotfound", "network"],
  },
];
