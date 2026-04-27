import { describe, it, expect } from "vitest";
import { MessageRole } from "@/generated/prisma";
import { MODEL_IDS } from "@/shared/config/models";
import { EXECUTOR_LADDER, MODEL_REGISTRY, MODEL_ROUTES } from "./constants";
import {
  fallbackSlugsFor,
  resolveRouteFallbacks,
  resolveSpecWith,
} from "./factory";
import { toModelMessages } from "./messages";

describe("resolveSpecWith", () => {
  it("returns the resolved config when the key exists", () => {
    const cfg = resolveSpecWith(
      { provider: "openrouter", model: "OPENAI_GPT_5_CODEX" },
      (p) => (p === "openrouter" ? "sk-or" : undefined)
    );
    expect(cfg).toEqual({
      provider: "openrouter",
      model: "OPENAI_GPT_5_CODEX",
      apiKey: "sk-or",
    });
  });

  it("throws when no provider has a key", () => {
    expect(() =>
      resolveSpecWith(
        { provider: "openrouter", model: "OPENAI_GPT_5_CODEX" },
        () => undefined
      )
    ).toThrow(/No API key/);
  });
});

describe("toModelMessages", () => {
  it("maps ASSISTANT → assistant and everything else → user, then reverses to chronological order", () => {
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

describe("MODEL_ROUTES", () => {
  it("declares a fallback list for every layer", () => {
    expect(MODEL_ROUTES.planner.fallbacks.length).toBeGreaterThan(0);
    expect(MODEL_ROUTES.executorDefault.fallbacks.length).toBeGreaterThan(0);
    expect(MODEL_ROUTES.executorFallback1.fallbacks.length).toBeGreaterThan(0);
    expect(MODEL_ROUTES.executorFallback2.fallbacks.length).toBeGreaterThan(0);
  });

  it("references only models present in MODEL_IDS", () => {
    for (const route of Object.values(MODEL_ROUTES)) {
      for (const fb of route.fallbacks) {
        expect(MODEL_IDS[fb.model]).toBeDefined();
      }
    }
  });

  it("does not list any layer's primary as another layer's fallback", () => {
    const primaries = new Set(
      Object.values(MODEL_ROUTES).map(
        (r) => `${r.primary.provider}:${r.primary.model}`
      )
    );
    for (const route of Object.values(MODEL_ROUTES)) {
      for (const fb of route.fallbacks) {
        expect(primaries.has(`${fb.provider}:${fb.model}`)).toBe(false);
      }
    }
  });
});

describe("resolveRouteFallbacks", () => {
  it("returns the configured fallbacks for a known primary", () => {
    const fallbacks = resolveRouteFallbacks(MODEL_REGISTRY.executorDefault);
    expect(fallbacks).toEqual(MODEL_ROUTES.executorDefault.fallbacks);
  });

  it("returns an empty list for an unknown primary", () => {
    const fallbacks = resolveRouteFallbacks({
      provider: "openrouter",
      model: "GEMMA_3_27B",
    });
    expect(fallbacks).toEqual([]);
  });
});

describe("fallbackSlugsFor", () => {
  it("maps each fallback ModelSpec to its OpenRouter slug in order", () => {
    const slugs = fallbackSlugsFor(MODEL_REGISTRY.executorFallback1);
    expect(slugs).toEqual(
      MODEL_ROUTES.executorFallback1.fallbacks.map(
        (spec) => MODEL_IDS[spec.model]
      )
    );
  });

  it("returns an empty list when the spec has no configured route", () => {
    expect(
      fallbackSlugsFor({ provider: "openrouter", model: "GEMMA_3_27B" })
    ).toEqual([]);
  });
});
