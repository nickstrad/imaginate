export type AgentErrorCategory =
  | "credit"
  | "rate_limit"
  | "auth"
  | "timeout"
  | "connection"
  | "tool_failed"
  | "model_refused"
  | "cancelled"
  | "unknown";

export interface AgentError {
  code: string;
  category: AgentErrorCategory;
  retryable: boolean;
  message: string;
}

type AgentErrorRule = {
  code: string;
  category: AgentErrorCategory;
  retryable: boolean;
  prefix: string;
  needles: string[];
};

const AGENT_ERROR_RULES: AgentErrorRule[] = [
  {
    code: "provider.credit",
    category: "credit",
    retryable: false,
    prefix: "Provider account limit reached",
    needles: ["credit", "balance", "quota", "insufficient"],
  },
  {
    code: "provider.rate_limit",
    category: "rate_limit",
    retryable: true,
    prefix: "Provider rate limit exceeded",
    needles: ["rate limit", "429", "too many requests"],
  },
  {
    code: "provider.auth",
    category: "auth",
    retryable: false,
    prefix: "Provider authentication failed",
    needles: ["unauthorized", "401", "api key", "authentication"],
  },
  {
    code: "provider.timeout",
    category: "timeout",
    retryable: true,
    prefix: "Provider timed out",
    needles: ["timeout", "etimedout"],
  },
  {
    code: "provider.connection",
    category: "connection",
    retryable: true,
    prefix: "Provider connection error",
    needles: ["econnreset", "econnrefused", "enotfound", "network"],
  },
  {
    code: "provider.model_refused",
    category: "model_refused",
    retryable: false,
    prefix: "Model refused the request",
    needles: ["refused", "safety", "content policy", "moderation"],
  },
  {
    code: "runtime.tool_failed",
    category: "tool_failed",
    retryable: false,
    prefix: "Tool call failed",
    needles: ["tool failed", "tool error", "tool call failed"],
  },
];

export function agentErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}

function makeAgentError(rule: AgentErrorRule, raw: string): AgentError {
  return {
    code: rule.code,
    category: rule.category,
    retryable: rule.retryable,
    message: `${rule.prefix}: ${raw}`,
  };
}

function isAbortError(err: unknown, raw: string): boolean {
  if (err instanceof Error && err.name === "AbortError") {
    return true;
  }
  return raw.toLowerCase().includes("aborterror");
}

export function classifyAgentError(err: unknown): AgentError {
  const raw = agentErrorMessage(err);

  if (isAbortError(err, raw)) {
    return {
      code: "runtime.cancelled",
      category: "cancelled",
      retryable: false,
      message: `Run cancelled: ${raw}`,
    };
  }

  const lower = raw.toLowerCase();
  const matchedRule = AGENT_ERROR_RULES.find((rule) =>
    rule.needles.some((needle) => lower.includes(needle))
  );

  if (matchedRule) {
    return makeAgentError(matchedRule, raw);
  }

  return {
    code: "provider.unknown",
    category: "unknown",
    retryable: false,
    message: `Provider error: ${raw}`,
  };
}
