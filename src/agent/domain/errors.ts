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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const MAX_CAUSE_DEPTH = 5;

/**
 * Extract structured context from a thrown error for logging.
 *
 * Duck-types fields that OpenRouter / AI SDK / Node fetch errors commonly
 * attach (statusCode, body, error.{code,message,metadata}, cause). Returns a
 * plain object suitable for passing as log `metadata`.
 */
export function extractErrorContext(err: unknown): Record<string, unknown> {
  return extractErrorContextInner(err, new WeakSet(), 0);
}

function extractErrorContextInner(
  err: unknown,
  seen: WeakSet<object>,
  depth: number
): Record<string, unknown> {
  const ctx: Record<string, unknown> = {
    message: agentErrorMessage(err),
  };
  if (!isRecord(err)) {
    return ctx;
  }
  if (seen.has(err)) {
    return ctx;
  }
  seen.add(err);
  const record = err;
  if (typeof record.name === "string") {
    ctx.name = record.name;
  }
  if (typeof record.statusCode === "number") {
    ctx.statusCode = record.statusCode;
  }
  if (record.contentType) {
    ctx.contentType = record.contentType;
  }
  if (record.body !== undefined) {
    const body = record.body;
    ctx.body = typeof body === "string" ? body.slice(0, 4000) : body;
  }
  if (isRecord(record.error)) {
    const inner = record.error;
    const errorCtx: Record<string, unknown> = {};
    if (inner.code !== undefined) {
      errorCtx.code = inner.code;
    }
    if (typeof inner.message === "string") {
      errorCtx.message = inner.message;
    }
    if (inner.metadata !== undefined) {
      errorCtx.metadata = inner.metadata;
    }
    ctx.error = errorCtx;
  }
  if (record.userId !== undefined) {
    ctx.userId = record.userId;
  }
  if (record.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    ctx.cause = extractErrorContextInner(record.cause, seen, depth + 1);
  }
  return ctx;
}

/**
 * Build the standard log metadata for a provider/runtime failure: classified
 * fields plus extracted error context, merged with any caller-supplied extras.
 */
export function buildErrorLogMetadata(
  err: unknown,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const classified = classifyAgentError(err);
  return {
    category: classified.category,
    code: classified.code,
    retryable: classified.retryable,
    providerError: extractErrorContext(err),
    ...extra,
  };
}

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
