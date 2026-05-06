import { describe, expect, it } from "vitest";
import {
  buildExecutorSystemPrompt,
  CACHE_PROVIDER_OPTIONS,
  getAgentPrompts,
} from ".";

describe("getAgentPrompts", () => {
  const prompts = getAgentPrompts();

  it("exposes a planner prompt that names the submitPlan tool and requiresCoding flag", () => {
    expect(prompts.planner).toMatch(/submitPlan/);
    expect(prompts.planner).toMatch(/requiresCoding/);
  });

  it("exposes an ask prompt that forbids code changes", () => {
    expect(prompts.ask).toMatch(/Ask/);
    expect(prompts.ask).toMatch(/CANNOT make code changes/);
  });

  it("exposes a project-naming prompt that asks for kebab-case", () => {
    expect(prompts.projectNaming).toMatch(/kebab-case/);
  });

  it("composes the executor base from identity, workflow, finalize, env, and fallback sections", () => {
    expect(prompts.executorBase).toMatch(/INSPECT/);
    expect(prompts.executorBase).toMatch(/MODIFY/);
    expect(prompts.executorBase).toMatch(/VERIFY/);
    expect(prompts.executorBase).toMatch(/FINALIZE/);
    expect(prompts.executorBase).toMatch(/finalize/);
  });
});

describe("buildExecutorSystemPrompt", () => {
  it("appends the plan after the executor base, separated by the cache boundary", () => {
    const out = buildExecutorSystemPrompt("plan-snippet-X");
    const cacheBoundary = "\n\n---\n\n";
    const idx = out.indexOf(cacheBoundary);
    expect(idx).toBeGreaterThan(0);
    expect(out.slice(idx + cacheBoundary.length)).toBe(
      "Plan from planner:\nplan-snippet-X"
    );
  });

  it("starts with the executor base", () => {
    const base = getAgentPrompts().executorBase;
    expect(buildExecutorSystemPrompt("x").startsWith(base)).toBe(true);
  });
});

describe("CACHE_PROVIDER_OPTIONS", () => {
  it("declares ephemeral cache control for openrouter and anthropic", () => {
    expect(CACHE_PROVIDER_OPTIONS.openrouter.cacheControl.type).toBe(
      "ephemeral"
    );
    expect(CACHE_PROVIDER_OPTIONS.anthropic.cacheControl.type).toBe(
      "ephemeral"
    );
  });
});
