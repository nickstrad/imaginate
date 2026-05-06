import { describe, expect, it } from "vitest";
import { normalizeMetadata, normalizeValue } from "./normalize";

describe("normalizeValue", () => {
  it("keeps large strings verbatim", () => {
    const value = "x".repeat(100_000);

    expect(normalizeValue(value)).toBe(value);
  });

  it("serializes errors", () => {
    const error = new Error("boom");

    expect(normalizeValue(error)).toMatchObject({
      name: "Error",
      message: "boom",
      stack: expect.any(String),
    });
  });
});

describe("normalizeMetadata", () => {
  it("redacts secret-like keys", () => {
    expect(
      normalizeMetadata({
        apiToken: "secret",
        nested: { bearer: "also-secret", safe: "ok" },
      })
    ).toEqual({
      apiToken: "[REDACTED]",
      nested: { bearer: "[REDACTED]", safe: "ok" },
    });
  });
});
