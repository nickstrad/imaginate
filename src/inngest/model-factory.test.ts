import { describe, it, expect } from "vitest";
import {
  resolveSpecWith,
  MODEL_REGISTRY,
  EXECUTOR_LADDER,
} from "./model-factory";

describe("resolveSpecWith", () => {
  it("returns the requested provider when its key exists", () => {
    const cfg = resolveSpecWith({ provider: "openai", model: "gpt-5" }, (p) =>
      p === "openai" ? "sk-openai" : undefined
    );
    expect(cfg).toEqual({
      provider: "openai",
      model: "gpt-5",
      apiKey: "sk-openai",
    });
  });

  it("falls back to the first provider with a key when requested key is missing", () => {
    const cfg = resolveSpecWith(
      { provider: "openai", model: "gpt-5" },
      (p) => (p === "anthropic" ? "sk-anth" : undefined),
      ["openai", "anthropic", "gemini"]
    );
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.apiKey).toBe("sk-anth");
    // model name carries over from the original spec
    expect(cfg.model).toBe("gpt-5");
  });

  it("throws when no provider has a key", () => {
    expect(() =>
      resolveSpecWith({ provider: "openai", model: "gpt-5" }, () => undefined)
    ).toThrow(/No API key/);
  });
});

describe("EXECUTOR_LADDER", () => {
  it("starts with the default executor and includes both fallbacks in order", () => {
    expect(EXECUTOR_LADDER[0]).toEqual(MODEL_REGISTRY.executorDefault);
    expect(EXECUTOR_LADDER[1]).toEqual(MODEL_REGISTRY.executorFallback1);
    expect(EXECUTOR_LADDER[2]).toEqual(MODEL_REGISTRY.executorFallback2);
  });
});
