import { describe, it, expect } from "vitest";
import { EnvSchema } from "./env";
import { MODEL_KEYS } from "./models";

describe("EnvSchema model fields", () => {
  it("applies defaults when MODEL_* vars are absent", () => {
    const parsed = EnvSchema.parse({});
    expect(parsed.MODEL_PLANNER).toBe(MODEL_KEYS.GEMINI_3_1_FLASH_LITE);
    expect(parsed.MODEL_EXECUTOR_DEFAULT).toBe(MODEL_KEYS.GEMINI_3_FLASH);
    expect(parsed.MODEL_EXECUTOR_FALLBACK_1).toBe(
      MODEL_KEYS.OPENAI_GPT_5_CODEX
    );
    expect(parsed.MODEL_EXECUTOR_FALLBACK_2).toBe(MODEL_KEYS.CLAUDE_SONNET_4_6);
  });

  it("accepts a valid MODEL_KEYS override", () => {
    const parsed = EnvSchema.parse({
      MODEL_EXECUTOR_DEFAULT: MODEL_KEYS.KIMI_K2_6,
    });
    expect(parsed.MODEL_EXECUTOR_DEFAULT).toBe(MODEL_KEYS.KIMI_K2_6);
  });

  it("rejects an unknown model key", () => {
    expect(() =>
      EnvSchema.parse({ MODEL_PLANNER: "google/gemini-3-flash-preview" })
    ).toThrow();
    expect(() => EnvSchema.parse({ MODEL_PLANNER: "not-a-model" })).toThrow();
  });
});
