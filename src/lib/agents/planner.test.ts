import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlanOutput } from "./schemas";
import type { AgentRuntimeEvent } from "./runtime";

const generateTextMock = vi.fn();

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateText: (...args: unknown[]) => generateTextMock(...args),
  };
});

vi.mock("@/lib/models", () => ({
  createModelProvider: vi.fn(() => ({})),
  resolvePlannerModel: vi.fn(() => ({
    provider: "openrouter",
    model: "test-model",
    apiKey: "test-key",
  })),
}));

vi.mock("@/lib/prompts", () => ({
  PLANNER_PROMPT: "test-planner-prompt",
  CACHE_PROVIDER_OPTIONS: {},
}));

const log = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
} as unknown as import("@/lib/log").Logger;

const samplePlan: PlanOutput = {
  requiresCoding: true,
  taskType: "code_change",
  targetFiles: ["a.ts"],
  verification: "tsc",
  notes: "test",
};

beforeEach(() => {
  generateTextMock.mockReset();
});

describe("planSnippet", () => {
  it("renders fields with target files", async () => {
    const { planSnippet } = await import("./planner");
    const out = planSnippet(samplePlan);
    expect(out).toContain("taskType: code_change");
    expect(out).toContain("targetFiles: a.ts");
    expect(out).toContain("verification: tsc");
    expect(out).toContain("notes: test");
  });

  it("falls back when plan undefined or empty", async () => {
    const { planSnippet } = await import("./planner");
    expect(planSnippet(undefined)).toBe("(no plan available)");
    expect(
      planSnippet({ ...samplePlan, targetFiles: [], notes: "" })
    ).toContain("targetFiles: (none inferred)");
    expect(
      planSnippet({ ...samplePlan, targetFiles: [], notes: "" })
    ).toContain("notes: (none)");
  });
});

describe("runPlanner", () => {
  it("emits planner.started then planner.finished when plan is captured", async () => {
    generateTextMock.mockImplementation(async ({ tools }) => {
      await tools.submitPlan.execute(samplePlan);
      return {};
    });
    const events: AgentRuntimeEvent[] = [];
    const { runPlanner } = await import("./planner");
    const plan = await runPlanner({
      userPrompt: "do thing",
      previousMessages: [],
      log,
      hooks: { emit: (e) => void events.push(e) },
    });
    expect(plan).toEqual(samplePlan);
    expect(events.map((e) => e.type)).toEqual([
      "planner.started",
      "planner.finished",
    ]);
    expect(events[1]).toMatchObject({ type: "planner.finished", plan });
  });

  it("emits planner.failed and returns fallback plan when generateText throws", async () => {
    generateTextMock.mockRejectedValue(new Error("provider down"));
    const events: AgentRuntimeEvent[] = [];
    const { runPlanner } = await import("./planner");
    const plan = await runPlanner({
      userPrompt: "do thing",
      previousMessages: [],
      log,
      hooks: { emit: (e) => void events.push(e) },
    });
    expect(plan.requiresCoding).toBe(true);
    expect(plan.taskType).toBe("other");
    expect(plan.verification).toBe("tsc");
    const types = events.map((e) => e.type);
    expect(types).toEqual([
      "planner.started",
      "planner.failed",
      "planner.finished",
    ]);
    expect(events[1]).toMatchObject({
      type: "planner.failed",
      error: expect.stringContaining("provider down"),
    });
  });

  it("returns fallback plan when generateText finishes without capturing", async () => {
    generateTextMock.mockResolvedValue({});
    const events: AgentRuntimeEvent[] = [];
    const { runPlanner } = await import("./planner");
    const plan = await runPlanner({
      userPrompt: "do thing",
      previousMessages: [],
      log,
      hooks: { emit: (e) => void events.push(e) },
    });
    expect(plan.requiresCoding).toBe(true);
    expect(plan.taskType).toBe("other");
    expect(events.map((e) => e.type)).toEqual([
      "planner.started",
      "planner.finished",
    ]);
  });

  it("works without hooks", async () => {
    generateTextMock.mockImplementation(async ({ tools }) => {
      await tools.submitPlan.execute(samplePlan);
      return {};
    });
    const { runPlanner } = await import("./planner");
    const plan = await runPlanner({
      userPrompt: "do thing",
      previousMessages: [],
      log,
    });
    expect(plan).toEqual(samplePlan);
  });
});
