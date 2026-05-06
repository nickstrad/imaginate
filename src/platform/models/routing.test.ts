import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODEL_IDS } from "@/shared/config/models";
import { PROVIDERS } from "@/platform/providers/types";

type RoutingModule = typeof import(".");

async function loadOpenRouterRouting(): Promise<RoutingModule> {
  vi.resetModules();
  vi.stubEnv("MODEL_PROVIDER", PROVIDERS.OPENROUTER);
  vi.stubEnv("MODEL_PLANNER", "GEMINI_3_1_FLASH_LITE");
  vi.stubEnv("MODEL_EXECUTOR_DEFAULT", "CLAUDE_SONNET_4_6");
  vi.stubEnv("MODEL_EXECUTOR_FALLBACK_1", "CLAUDE_HAIKU_4_5");
  vi.stubEnv("MODEL_EXECUTOR_FALLBACK_2", "CLAUDE_OPUS_4_7");
  return import(".");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("resolveSpecWith", () => {
  let routing: RoutingModule;

  beforeEach(async () => {
    routing = await loadOpenRouterRouting();
  });

  it("returns the resolved config when an injected resolver returns a key", () => {
    const cfg = routing.resolveSpecWith(
      { provider: PROVIDERS.OPENROUTER, model: "OPENAI_GPT_5_CODEX" },
      (p) => (p === PROVIDERS.OPENROUTER ? "sk-or" : undefined)
    );
    expect(cfg).toEqual({
      provider: PROVIDERS.OPENROUTER,
      model: "OPENAI_GPT_5_CODEX",
      apiKey: "sk-or",
    });
  });

  it("throws when the resolver returns no key for an OpenRouter spec", () => {
    expect(() =>
      routing.resolveSpecWith(
        { provider: PROVIDERS.OPENROUTER, model: "OPENAI_GPT_5_CODEX" },
        () => undefined
      )
    ).toThrow(/No API key/);
  });

  it("resolves an LM Studio spec without requiring an API key", () => {
    const cfg = routing.resolveSpecWith(
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

describe("resolveExecutorModels", () => {
  it("returns default → fallback1 → fallback2 in order under OpenRouter", async () => {
    const routing = await loadOpenRouterRouting();
    const ladder = routing.resolveExecutorModels();
    expect(ladder.map((s) => s.model)).toEqual([
      "CLAUDE_SONNET_4_6",
      "CLAUDE_HAIKU_4_5",
      "CLAUDE_OPUS_4_7",
    ]);
    for (const spec of ladder) {
      expect(spec.provider).toBe(PROVIDERS.OPENROUTER);
    }
  });

  it("collapses to a single rung in LM Studio mode", async () => {
    vi.resetModules();
    vi.stubEnv("MODEL_PROVIDER", PROVIDERS.LM_STUDIO);
    vi.stubEnv("LM_STUDIO_BASE_URL", "http://127.0.0.1:1234/v1");
    vi.stubEnv("LM_STUDIO_MODEL", "qwen/qwen3-coder-next");

    const routing = await import(".");
    expect(routing.resolveExecutorModels()).toEqual([
      { provider: PROVIDERS.LM_STUDIO, model: "qwen/qwen3-coder-next" },
    ]);
  });
});

describe("resolvePlannerModel", () => {
  it("resolves the configured planner spec using the platform's default key resolver", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-from-env");
    const routing = await loadOpenRouterRouting();
    const planner = routing.resolvePlannerModel();
    expect(planner).toEqual({
      provider: PROVIDERS.OPENROUTER,
      model: "GEMINI_3_1_FLASH_LITE",
      apiKey: "sk-or-from-env",
    });
  });
});

describe("resolveFallbackSlugs", () => {
  it("maps OpenRouter fallbacks for executorFallback1 to slugs in order", async () => {
    const routing = await loadOpenRouterRouting();
    const ladder = routing.resolveExecutorModels();
    const slugs = routing.resolveFallbackSlugs(ladder[1]);
    expect(slugs).toEqual([
      MODEL_IDS["GROK_CODE_FAST_1"],
      MODEL_IDS["DEEPSEEK_V4_FLASH"],
    ]);
  });

  it("returns empty for an OpenRouter spec with no configured route", async () => {
    const routing = await loadOpenRouterRouting();
    expect(
      routing.resolveFallbackSlugs({
        provider: PROVIDERS.OPENROUTER,
        model: "GEMMA_3_27B",
      })
    ).toEqual([]);
  });

  it("returns empty for an LM Studio spec", async () => {
    const routing = await loadOpenRouterRouting();
    expect(
      routing.resolveFallbackSlugs({
        provider: PROVIDERS.LM_STUDIO,
        model: "qwen/qwen3-coder-next",
      })
    ).toEqual([]);
  });
});
