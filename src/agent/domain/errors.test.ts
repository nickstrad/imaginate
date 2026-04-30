import { describe, it, expect } from "vitest";
import { classifyAgentError } from "./errors";

describe("classifyAgentError", () => {
  const cases = [
    {
      name: "credit/balance",
      input: "Insufficient credit balance",
      category: "credit",
      retryable: false,
      code: "provider.credit",
    },
    {
      name: "credit/quota",
      input: "Quota exceeded for project",
      category: "credit",
      retryable: false,
      code: "provider.credit",
    },
    {
      name: "rate_limit/429",
      input: "HTTP 429 too many requests",
      category: "rate_limit",
      retryable: true,
      code: "provider.rate_limit",
    },
    {
      name: "rate_limit/text",
      input: "rate limit hit",
      category: "rate_limit",
      retryable: true,
      code: "provider.rate_limit",
    },
    {
      name: "auth/401",
      input: "401 Unauthorized",
      category: "auth",
      retryable: false,
      code: "provider.auth",
    },
    {
      name: "auth/api key",
      input: "Invalid API key supplied",
      category: "auth",
      retryable: false,
      code: "provider.auth",
    },
    {
      name: "timeout",
      input: "Request ETIMEDOUT after 30s",
      category: "timeout",
      retryable: true,
      code: "provider.timeout",
    },
    {
      name: "connection/econnreset",
      input: "ECONNRESET while reading",
      category: "connection",
      retryable: true,
      code: "provider.connection",
    },
    {
      name: "connection/network",
      input: "network unreachable",
      category: "connection",
      retryable: true,
      code: "provider.connection",
    },
    {
      name: "model_refused",
      input: "Model refused because of a content policy",
      category: "model_refused",
      retryable: false,
      code: "provider.model_refused",
    },
    {
      name: "tool_failed",
      input: "Tool call failed while applying edit",
      category: "tool_failed",
      retryable: false,
      code: "runtime.tool_failed",
    },
    {
      name: "unknown",
      input: "totally unrelated error",
      category: "unknown",
      retryable: false,
      code: "provider.unknown",
    },
  ] as const;

  for (const c of cases) {
    it(`classifies ${c.name}`, () => {
      const result = classifyAgentError(new Error(c.input));
      expect(result.category).toBe(c.category);
      expect(result.retryable).toBe(c.retryable);
      expect(result.code).toBe(c.code);
      expect(result.message).toContain(c.input);
    });
  }

  it("classifies abort errors as cancelled", () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";

    const result = classifyAgentError(err);

    expect(result).toMatchObject({
      category: "cancelled",
      code: "runtime.cancelled",
      retryable: false,
    });
  });

  it("first-match wins on overlapping needles (credit before auth via 'authentication')", () => {
    const result = classifyAgentError(
      new Error("credit and authentication failed")
    );

    expect(result.category).toBe("credit");
  });

  it("handles non-Error input", () => {
    expect(classifyAgentError("ETIMEDOUT").category).toBe("timeout");
    expect(classifyAgentError({ foo: "bar" }).category).toBe("unknown");
    expect(classifyAgentError(null).category).toBe("unknown");
    expect(classifyAgentError(undefined).category).toBe("unknown");
  });

  it("matching is case-insensitive", () => {
    expect(classifyAgentError(new Error("RATE LIMIT")).category).toBe(
      "rate_limit"
    );
  });
});
