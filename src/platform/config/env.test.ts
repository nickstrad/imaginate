import { describe, it, expect } from "vitest";
import { EnvSchema } from "./env";
import { MODEL_KEYS } from "@/shared/config/models";
import { PROVIDERS } from "@/platform/providers/types";

describe("EnvSchema model fields", () => {
  it("applies defaults when MODEL_* vars are absent", () => {
    const parsed = EnvSchema.parse({});
    expect(parsed.MODEL_PROVIDER).toBe(PROVIDERS.OPENROUTER);
    expect(parsed.LM_STUDIO_BASE_URL).toBe("http://127.0.0.1:1234/v1");
    expect(parsed.LM_STUDIO_MODEL).toBe("qwen/qwen3-coder-next");
    expect(parsed.MODEL_PLANNER).toBe(MODEL_KEYS.GEMINI_3_1_FLASH_LITE);
    expect(parsed.MODEL_EXECUTOR_DEFAULT).toBe(MODEL_KEYS.CLAUDE_SONNET_4_6);
    expect(parsed.MODEL_EXECUTOR_FALLBACK_1).toBe(MODEL_KEYS.CLAUDE_HAIKU_4_5);
    expect(parsed.MODEL_EXECUTOR_FALLBACK_2).toBe(MODEL_KEYS.CLAUDE_OPUS_4_7);
    expect(parsed.LOG_LLM_PAYLOADS).toBe(false);
  });

  it("accepts LM Studio as the local model provider", () => {
    const parsed = EnvSchema.parse({
      MODEL_PROVIDER: PROVIDERS.LM_STUDIO,
      LM_STUDIO_BASE_URL: "http://localhost:1234/v1",
      LM_STUDIO_MODEL: "gemma-4-31b-it",
    });

    expect(parsed.MODEL_PROVIDER).toBe(PROVIDERS.LM_STUDIO);
    expect(parsed.LM_STUDIO_BASE_URL).toBe("http://localhost:1234/v1");
    expect(parsed.LM_STUDIO_MODEL).toBe("gemma-4-31b-it");
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

  it("rejects an unknown model provider", () => {
    expect(() => EnvSchema.parse({ MODEL_PROVIDER: "ollama" })).toThrow();
  });

  it("parses LOG_LLM_PAYLOADS as a boolean", () => {
    expect(EnvSchema.parse({ LOG_LLM_PAYLOADS: "true" })).toMatchObject({
      LOG_LLM_PAYLOADS: true,
    });
    expect(EnvSchema.parse({ LOG_LLM_PAYLOADS: "false" })).toMatchObject({
      LOG_LLM_PAYLOADS: false,
    });
  });
});
