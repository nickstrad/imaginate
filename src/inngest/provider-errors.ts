export type ProviderErrorCategory =
  | "credit"
  | "rate_limit"
  | "auth"
  | "timeout"
  | "connection"
  | "unknown";

export interface ClassifiedProviderError {
  category: ProviderErrorCategory;
  retryable: boolean;
  raw: string;
  userMessage: string;
}

type Rule = {
  category: ProviderErrorCategory;
  retryable: boolean;
  prefix: string;
  needles: string[];
};

const RULES: Rule[] = [
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

export function classifyProviderError(err: unknown): ClassifiedProviderError {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : JSON.stringify(err);
  const lower = raw.toLowerCase();

  for (const rule of RULES) {
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
