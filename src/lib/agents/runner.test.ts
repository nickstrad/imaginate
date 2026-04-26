import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ModelSpec, ResolvedModelConfig } from "@/lib/models";
import {
  AgentRuntimeEventType,
  EscalateReason,
  type AgentRuntimeEvent,
  type RunCodingOpts,
} from "./runtime";
import type { PlanOutput } from "./schemas";

const runExecutorOnceMock = vi.fn();
const resolveSpecMock = vi.fn();
const classifyProviderErrorMock = vi.fn();

vi.mock("./executor", () => ({
  runExecutorOnce: (...args: unknown[]) => runExecutorOnceMock(...args),
}));

const ladder = [
  { provider: "openrouter", model: "model-a" },
  { provider: "openrouter", model: "model-b" },
  { provider: "openrouter", model: "model-c" },
] as unknown as ModelSpec[];

vi.mock("@/lib/models", () => ({
  EXECUTOR_LADDER: ladder,
  resolveSpec: (spec: ModelSpec) => resolveSpecMock(spec),
}));

vi.mock("@/lib/errors", () => ({
  classifyProviderError: (err: unknown) => classifyProviderErrorMock(err),
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

function makeOpts(events: AgentRuntimeEvent[]): RunCodingOpts {
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
    userPrompt: "do thing",
    log,
    hooks: {
      getSandbox: async () => ({}) as never,
      emit: (e) => void events.push(e),
    },
  };
}

const resolved = (model: string): ResolvedModelConfig =>
  ({
    provider: "openrouter",
    model,
    apiKey: "k",
  }) as unknown as ResolvedModelConfig;

beforeEach(() => {
  runExecutorOnceMock.mockReset();
  resolveSpecMock.mockReset();
  classifyProviderErrorMock.mockReset();
  resolveSpecMock.mockImplementation((spec: ModelSpec) => resolved(spec.model));
});

describe("runCodingAgentWithEscalation", () => {
  it("stops on first accepted attempt and emits accepted + agent.finished", async () => {
    runExecutorOnceMock.mockResolvedValueOnce({
      result: { steps: [{}, {}, {}] },
      stepsCount: 3,
      escalated: false,
    });
    const events: AgentRuntimeEvent[] = [];
    const { runCodingAgentWithEscalation } = await import("./runner");
    const outcome = await runCodingAgentWithEscalation(makeOpts(events));

    expect(runExecutorOnceMock).toHaveBeenCalledTimes(1);
    expect(outcome.stepsCount).toBe(3);
    expect(outcome.lastErrorMessage).toBeNull();
    expect(events.map((e) => e.type)).toEqual([
      AgentRuntimeEventType.ExecutorAttemptStarted,
      AgentRuntimeEventType.ExecutorAccepted,
      AgentRuntimeEventType.AgentFinished,
    ]);
  });

  it("continues to next ladder rung when shouldEscalate triggers", async () => {
    runExecutorOnceMock
      .mockResolvedValueOnce({
        result: {},
        stepsCount: 0,
        escalated: true,
        reason: EscalateReason.NoWrites,
      })
      .mockResolvedValueOnce({
        result: { steps: [{}] },
        stepsCount: 1,
        escalated: false,
      });

    const events: AgentRuntimeEvent[] = [];
    const { runCodingAgentWithEscalation } = await import("./runner");
    await runCodingAgentWithEscalation(makeOpts(events));

    expect(runExecutorOnceMock).toHaveBeenCalledTimes(2);
    const types = events.map((e) => e.type);
    expect(types).toContain(AgentRuntimeEventType.ExecutorEscalated);
    expect(types).toContain(AgentRuntimeEventType.ExecutorAccepted);
  });

  it("retries on retryable provider error and stops on non-retryable", async () => {
    classifyProviderErrorMock
      .mockReturnValueOnce({
        category: "rate_limit",
        retryable: true,
        userMessage: "x",
      })
      .mockReturnValueOnce({
        category: "auth",
        retryable: false,
        userMessage: "x",
      });

    runExecutorOnceMock
      .mockResolvedValueOnce({
        result: null,
        stepsCount: 0,
        escalated: true,
        error: new Error("rate limited"),
      })
      .mockResolvedValueOnce({
        result: null,
        stepsCount: 0,
        escalated: true,
        error: new Error("bad key"),
      });

    const events: AgentRuntimeEvent[] = [];
    const { runCodingAgentWithEscalation } = await import("./runner");
    const outcome = await runCodingAgentWithEscalation(makeOpts(events));

    expect(runExecutorOnceMock).toHaveBeenCalledTimes(2);
    expect(outcome.lastErrorMessage).toBe("bad key");
    const failures = events.filter(
      (e) => e.type === AgentRuntimeEventType.ExecutorAttemptFailed
    );
    expect(failures).toHaveLength(2);
  });

  it("skips ladder slot whose resolveSpec throws", async () => {
    resolveSpecMock.mockReset();
    resolveSpecMock
      .mockImplementationOnce(() => {
        throw new Error("missing key");
      })
      .mockImplementationOnce((spec: ModelSpec) => resolved(spec.model))
      .mockImplementationOnce((spec: ModelSpec) => resolved(spec.model));

    runExecutorOnceMock.mockResolvedValueOnce({
      result: { steps: [] },
      stepsCount: 0,
      escalated: false,
    });

    const events: AgentRuntimeEvent[] = [];
    const { runCodingAgentWithEscalation } = await import("./runner");
    await runCodingAgentWithEscalation(makeOpts(events));

    expect(runExecutorOnceMock).toHaveBeenCalledTimes(1);
    const started = events.filter(
      (e) => e.type === AgentRuntimeEventType.ExecutorAttemptStarted
    );
    // attempt counter equals ladder index + 1; first slot was skipped, so attempt 2.
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({ attempt: 2 });
  });
});
