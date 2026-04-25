import { describe, it, expect } from "vitest";
import { MessageRole } from "@/generated/prisma";
import {
  resolveSpecWith,
  MODEL_REGISTRY,
  EXECUTOR_LADDER,
  toModelMessages,
} from "./model-factory";

describe("resolveSpecWith", () => {
  it("returns the resolved config when the key exists", () => {
    const cfg = resolveSpecWith(
      { provider: "openrouter", model: "OPENAI_GPT_5" },
      (p) => (p === "openrouter" ? "sk-or" : undefined)
    );
    expect(cfg).toEqual({
      provider: "openrouter",
      model: "OPENAI_GPT_5",
      apiKey: "sk-or",
    });
  });

  it("throws when no provider has a key", () => {
    expect(() =>
      resolveSpecWith(
        { provider: "openrouter", model: "OPENAI_GPT_5" },
        () => undefined
      )
    ).toThrow(/No API key/);
  });
});

describe("toModelMessages", () => {
  it("maps ASSISTANT → assistant and everything else → user, then reverses to chronological order", () => {
    // input is desc-by-createdAt (newest first), as the prisma query returns
    const rows = [
      { role: MessageRole.ASSISTANT, content: "third" },
      { role: MessageRole.USER, content: "second" },
      { role: MessageRole.ASSISTANT, content: "first" },
    ];

    expect(toModelMessages(rows)).toEqual([
      { role: "assistant", content: "first" },
      { role: "user", content: "second" },
      { role: "assistant", content: "third" },
    ]);
  });

  it("returns an empty array for no rows", () => {
    expect(toModelMessages([])).toEqual([]);
  });
});

describe("EXECUTOR_LADDER", () => {
  it("starts with the default executor and includes both fallbacks in order", () => {
    expect(EXECUTOR_LADDER[0]).toEqual(MODEL_REGISTRY.executorDefault);
    expect(EXECUTOR_LADDER[1]).toEqual(MODEL_REGISTRY.executorFallback1);
    expect(EXECUTOR_LADDER[2]).toEqual(MODEL_REGISTRY.executorFallback2);
  });
});
