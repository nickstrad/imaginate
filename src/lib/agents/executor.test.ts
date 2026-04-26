import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ModelSpec, ResolvedModelConfig } from "@/lib/models";
import {
  AgentRuntimeEventType,
  EscalateReason,
  type AgentRuntimeEvent,
  type RunCodingOpts,
} from "./runtime";
import type { PlanOutput } from "./schemas";

vi.mock("@/lib/models", () => ({
  createModelProvider: vi.fn(() => ({})),
}));

vi.mock("@/lib/prompts", () => ({
  buildExecutorSystemPrompt: (s: string) => `sys:${s}`,
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
  targetFiles: [],
  verification: "tsc",
  notes: "",
};

const spec = {
  provider: "openrouter",
  model: "model-a",
} as unknown as ModelSpec;
const modelConfig = {
  provider: "openrouter",
  model: "model-a",
  apiKey: "k",
} as unknown as ResolvedModelConfig;

function makeOpts(
  events: AgentRuntimeEvent[],
  generateText: RunCodingOpts["generateText"]
): RunCodingOpts {
  return {
    thoughts: [],
    cumulativeUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    plan: samplePlan,
    runState: {
      filesWritten: {},
      filesRead: [],
      commandsRun: [],
      verification: [],
      plan: samplePlan,
      finalOutput: undefined,
      totalAttempts: 0,
      escalatedTo: null,
    },
    previousMessages: [],
    userPrompt: "make button blue",
    log,
    hooks: {
      getSandbox: async () => ({}) as never,
      emit: (e) => void events.push(e),
    },
    generateText,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runExecutorOnce", () => {
  it("emits step events and accumulates usage from onStepFinish", async () => {
    const events: AgentRuntimeEvent[] = [];
    const fakeGenerateText = (async (config: {
      onStepFinish?: (s: unknown) => Promise<void>;
    }) => {
      await config.onStepFinish?.({
        stepNumber: 0,
        text: "doing work",
        finishReason: "stop",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        toolCalls: [],
        toolResults: [],
      });
      return { steps: [{}], text: "" };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    const opts = makeOpts(events, fakeGenerateText);
    const { runExecutorOnce } = await import("./executor");
    await runExecutorOnce(spec, modelConfig, opts);

    expect(opts.cumulativeUsage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
    expect(opts.thoughts).toHaveLength(1);
    const stepEvents = events.filter(
      (e) => e.type === AgentRuntimeEventType.ExecutorStepFinished
    );
    expect(stepEvents).toHaveLength(1);
    expect(opts.runState.totalAttempts).toBe(1);
    expect(opts.runState.escalatedTo).toBe("openrouter:model-a");
  });

  it("populates finalOutput from task_summary fallback when finalize was not called", async () => {
    const events: AgentRuntimeEvent[] = [];
    const fakeGenerateText = (async () => ({
      steps: [],
      text: "all done <task_summary>made the button blue</task_summary>",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake: mimicking only the subset of generateText's return shape that the executor reads.
    })) as any;

    // mark a successful verification + a write so shouldEscalate returns false
    const opts = makeOpts(events, fakeGenerateText);
    opts.runState.filesWritten["x.ts"] = "y";
    opts.runState.verification.push({
      kind: "build",
      command: "tsc",
      success: true,
    });

    const { runExecutorOnce } = await import("./executor");
    const result = await runExecutorOnce(spec, modelConfig, opts);

    expect(opts.runState.finalOutput?.summary).toBe("made the button blue");
    expect(result.escalated).toBe(false);
  });

  it("returns escalated=true with error when generateText throws", async () => {
    const events: AgentRuntimeEvent[] = [];
    const fakeGenerateText = (async () => {
      throw new Error("provider boom");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    const opts = makeOpts(events, fakeGenerateText);
    const { runExecutorOnce } = await import("./executor");
    const result = await runExecutorOnce(spec, modelConfig, opts);

    expect(result.escalated).toBe(true);
    expect(result.reason).toBe(EscalateReason.Exception);
    expect(String(result.error)).toContain("provider boom");
  });
});
