import { describe, it, expect } from "vitest";
import { classifyProviderError } from "./provider-errors";

describe("classifyProviderError", () => {
  const cases = [
    { name: "credit/balance", input: "Insufficient credit balance", category: "credit", retryable: false },
    { name: "credit/quota", input: "Quota exceeded for project", category: "credit", retryable: false },
    { name: "rate_limit/429", input: "HTTP 429 too many requests", category: "rate_limit", retryable: true },
    { name: "rate_limit/text", input: "rate limit hit", category: "rate_limit", retryable: true },
    { name: "auth/401", input: "401 Unauthorized", category: "auth", retryable: false },
    { name: "auth/api key", input: "Invalid API key supplied", category: "auth", retryable: false },
    { name: "timeout", input: "Request ETIMEDOUT after 30s", category: "timeout", retryable: true },
    { name: "connection/econnreset", input: "ECONNRESET while reading", category: "connection", retryable: true },
    { name: "connection/network", input: "network unreachable", category: "connection", retryable: true },
    { name: "unknown", input: "totally unrelated error", category: "unknown", retryable: false },
  ] as const;

  for (const c of cases) {
    it(`classifies ${c.name}`, () => {
      const result = classifyProviderError(new Error(c.input));
      expect(result.category).toBe(c.category);
      expect(result.retryable).toBe(c.retryable);
      expect(result.raw).toBe(c.input);
      expect(result.userMessage).toContain(c.input);
    });
  }

  it("first-match wins on overlapping needles (credit before auth via 'authentication')", () => {
    // 'authentication' triggers auth; 'credit' triggers credit. credit comes first.
    const r = classifyProviderError(new Error("credit and authentication failed"));
    expect(r.category).toBe("credit");
  });

  it("handles non-Error input", () => {
    expect(classifyProviderError("ETIMEDOUT").category).toBe("timeout");
    expect(classifyProviderError({ foo: "bar" }).category).toBe("unknown");
    expect(classifyProviderError(null).category).toBe("unknown");
  });

  it("matching is case-insensitive", () => {
    expect(classifyProviderError(new Error("RATE LIMIT")).category).toBe("rate_limit");
  });
});
