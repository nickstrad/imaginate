import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { MessageRole } from "@/generated/prisma";
import { MODEL_IDS } from "@/shared/config/models";
import { PROVIDERS } from "@/platform/providers/types";
import { toModelMessages } from "./messages";

type ConstantsModule = typeof import("./constants");
type FactoryModule = typeof import("./factory");

async function loadOpenRouterMode(): Promise<{
  constants: ConstantsModule;
  factory: FactoryModule;
}> {
  vi.resetModules();
  vi.stubEnv("MODEL_PROVIDER", PROVIDERS.OPENROUTER);
  vi.stubEnv("MODEL_PLANNER", "GEMINI_3_1_FLASH_LITE");
  vi.stubEnv("MODEL_EXECUTOR_DEFAULT", "CLAUDE_SONNET_4_6");
  vi.stubEnv("MODEL_EXECUTOR_FALLBACK_1", "CLAUDE_HAIKU_4_5");
  vi.stubEnv("MODEL_EXECUTOR_FALLBACK_2", "CLAUDE_OPUS_4_7");
  return {
    constants: await import("./constants"),
    factory: await import("./factory"),
  };
}

describe("resolveSpecWith", () => {
  let factory: FactoryModule;

  beforeEach(async () => {
    ({ factory } = await loadOpenRouterMode());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns the resolved config when the key exists", () => {
    const cfg = factory.resolveSpecWith(
      { provider: PROVIDERS.OPENROUTER, model: "OPENAI_GPT_5_CODEX" },
      (p) => (p === PROVIDERS.OPENROUTER ? "sk-or" : undefined)
    );
    expect(cfg).toEqual({
      provider: PROVIDERS.OPENROUTER,
      model: "OPENAI_GPT_5_CODEX",
      apiKey: "sk-or",
    });
  });

  it("throws when no provider has a key", () => {
    expect(() =>
      factory.resolveSpecWith(
        { provider: PROVIDERS.OPENROUTER, model: "OPENAI_GPT_5_CODEX" },
        () => undefined
      )
    ).toThrow(/No API key/);
  });

  it("resolves LM Studio without requiring an API key", () => {
    const cfg = factory.resolveSpecWith(
      { provider: PROVIDERS.LM_STUDIO, model: "qwen/qwen3-coder-next" },
      () => undefined,
      { lmStudioBaseURL: "http://127.0.0.1:1234/v1" }
    );

    expect(cfg).toEqual({
      provider: PROVIDERS.LM_STUDIO,
      model: "qwen/qwen3-coder-next",
      baseURL: "http://127.0.0.1:1234/v1",
    });
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
  let constants: ConstantsModule;

  beforeEach(async () => {
    ({ constants } = await loadOpenRouterMode());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("starts with the default executor and includes both fallbacks in order", () => {
    expect(constants.EXECUTOR_LADDER[0]).toEqual(
      constants.MODEL_REGISTRY.executorDefault
    );
    expect(constants.EXECUTOR_LADDER[1]).toEqual(
      constants.MODEL_REGISTRY.executorFallback1
    );
    expect(constants.EXECUTOR_LADDER[2]).toEqual(
      constants.MODEL_REGISTRY.executorFallback2
    );
  });
});

describe("LM Studio route mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses one local model for planning and a single executor rung", async () => {
    vi.resetModules();
    vi.stubEnv("MODEL_PROVIDER", PROVIDERS.LM_STUDIO);
    vi.stubEnv("LM_STUDIO_BASE_URL", "http://127.0.0.1:1234/v1");
    vi.stubEnv("LM_STUDIO_MODEL", "qwen/qwen3-coder-next");

    const constants = await import("./constants");

    expect(constants.MODEL_REGISTRY.planner).toEqual({
      provider: PROVIDERS.LM_STUDIO,
      model: "qwen/qwen3-coder-next",
    });
    expect(constants.EXECUTOR_LADDER).toEqual([
      { provider: PROVIDERS.LM_STUDIO, model: "qwen/qwen3-coder-next" },
    ]);
    expect(
      Object.values(constants.MODEL_ROUTES).every(
        (route) => route.fallbacks.length === 0
      )
    ).toBe(true);
  });
});

describe("MODEL_ROUTES", () => {
  let constants: ConstantsModule;

  beforeEach(async () => {
    ({ constants } = await loadOpenRouterMode());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("declares a fallback list for every layer", () => {
    for (const route of Object.values(constants.MODEL_ROUTES)) {
      if (route.primary.provider === PROVIDERS.OPENROUTER) {
        expect(route.fallbacks.length).toBeGreaterThan(0);
      } else {
        expect(route.fallbacks).toEqual([]);
      }
    }
  });

  it("references only models present in MODEL_IDS", () => {
    for (const route of Object.values(constants.MODEL_ROUTES)) {
      for (const fb of route.fallbacks) {
        expect(MODEL_IDS[fb.model]).toBeDefined();
      }
    }
  });

  it("does not list any layer's primary as another layer's fallback", () => {
    const primaries = new Set(
      Object.values(constants.MODEL_ROUTES).map(
        (r) => `${r.primary.provider}:${r.primary.model}`
      )
    );
    for (const route of Object.values(constants.MODEL_ROUTES)) {
      for (const fb of route.fallbacks) {
        expect(primaries.has(`${fb.provider}:${fb.model}`)).toBe(false);
      }
    }
  });
});

describe("resolveRouteFallbacks", () => {
  let constants: ConstantsModule;
  let factory: FactoryModule;

  beforeEach(async () => {
    ({ constants, factory } = await loadOpenRouterMode());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns the configured fallbacks for a known primary", () => {
    const fallbacks = factory.resolveRouteFallbacks(
      constants.MODEL_REGISTRY.executorDefault
    );
    expect(fallbacks).toEqual(constants.MODEL_ROUTES.executorDefault.fallbacks);
  });

  it("returns an empty list for an unknown primary", () => {
    const fallbacks = factory.resolveRouteFallbacks({
      provider: PROVIDERS.OPENROUTER,
      model: "GEMMA_3_27B",
    });
    expect(fallbacks).toEqual([]);
  });
});

describe("fallbackSlugsFor", () => {
  let constants: ConstantsModule;
  let factory: FactoryModule;

  beforeEach(async () => {
    ({ constants, factory } = await loadOpenRouterMode());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("maps each fallback ModelSpec to its OpenRouter slug in order", () => {
    const slugs = factory.fallbackSlugsFor(
      constants.MODEL_REGISTRY.executorFallback1
    );
    expect(slugs).toEqual(
      constants.MODEL_ROUTES.executorFallback1.fallbacks.map(
        (spec) => MODEL_IDS[spec.model]
      )
    );
  });

  it("returns an empty list when the spec has no configured route", () => {
    expect(
      factory.fallbackSlugsFor({
        provider: PROVIDERS.OPENROUTER,
        model: "GEMMA_3_27B",
      })
    ).toEqual([]);
  });

  it("returns an empty list for LM Studio models", () => {
    expect(
      factory.fallbackSlugsFor({
        provider: PROVIDERS.LM_STUDIO,
        model: "qwen/qwen3-coder-next",
      })
    ).toEqual([]);
  });
});
