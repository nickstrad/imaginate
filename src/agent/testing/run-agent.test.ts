import { describe, it, expect } from "vitest";
import { runAgent } from "../application/run-agent";
import { AgentRuntimeEventType } from "../domain/events";
import {
  createFakeModelGateway,
  createFakeSandboxGateway,
  createFakeToolFactory,
  createInMemoryEventSink,
  createInMemoryMessageStore,
  createInMemoryTelemetryStore,
  createNoopAgentLogger,
} from "./in-memory-stores";
import type { GenerateTextRequest, GenerateTextResult } from "../ports";
import type { FinalOutput, PlanOutput, RunState } from "../domain/types";
import type { AgentError, AgentErrorCategory } from "../domain/errors";

const samplePlan: PlanOutput = {
  requiresCoding: true,
  taskType: "code_change",
  targetFiles: [],
  verification: "tsc",
  notes: "",
};

const successFinal: FinalOutput = {
  status: "success",
  title: "ok",
  summary: "done",
  verification: [],
  nextSteps: [],
};

function baseConfig() {
  return {
    plannerSystemPrompt: "PLAN",
    buildExecutorSystemPrompt: (s: string) => `EXEC:${s}`,
  };
}

function plannerCapture(plan: PlanOutput) {
  return async (req: GenerateTextRequest): Promise<GenerateTextResult> => {
    const submit = req.tools?.submitPlan;
    if (submit) {
      await submit.execute(plan);
    }
    return { steps: [] };
  };
}

function executorFinalize(output: FinalOutput) {
  return async (req: GenerateTextRequest): Promise<GenerateTextResult> => {
    const finalize = req.tools?.finalize;
    if (finalize) {
      await finalize.execute(output);
    }
    return { steps: [{ stepIndex: 0, text: "done" }] };
  };
}

function executorEmptyStep() {
  return async (_req: GenerateTextRequest): Promise<GenerateTextResult> => {
    return { steps: [] };
  };
}

function classifiedError(
  category: AgentErrorCategory,
  retryable: boolean,
  message = "classified"
): AgentError {
  return {
    code: `test.${category}`,
    category,
    retryable,
    message,
  };
}

describe("runAgent", () => {
  it("success on first ladder slot", async () => {
    const sink = createInMemoryEventSink();
    const gateway = createFakeModelGateway({
      executorModelIds: ["fake:a", "fake:b", "fake:c"],
      responses: [plannerCapture(samplePlan), executorFinalize(successFinal)],
    });

    const result = await runAgent({
      input: { prompt: "hi", projectId: "p1" },
      deps: {
        modelGateway: gateway,
        sandboxGateway: createFakeSandboxGateway(),
        toolFactory: createFakeToolFactory(),
        messageStore: createInMemoryMessageStore(),
        telemetryStore: createInMemoryTelemetryStore(),
        eventSink: sink,
        logger: createNoopAgentLogger(),
      },
      config: baseConfig(),
    });

    expect(result.finalOutput?.status).toBe("success");
    expect(result.runState).toBeDefined();
    expect(Object.isFrozen(result.runState)).toBe(true);
    expect(Object.isFrozen(result.runState.commandsRun)).toBe(true);
    expect(Object.isFrozen(result.runState.verification)).toBe(true);
    expect(Object.isFrozen(result.runState.plan)).toBe(true);
    expect(Object.isFrozen(result.runState.finalOutput)).toBe(true);
    expect(Object.isFrozen(result.runState.finalOutput?.verification)).toBe(
      true
    );
    expect(Object.isFrozen(result.runState.plan?.targetFiles)).toBe(true);
    expect(() => {
      (result.runState as RunState).totalAttempts = 99;
    }).toThrow();
    expect(result.runState.plan).toEqual(samplePlan);
    expect(result.runState.finalOutput?.status).toBe("success");
    const types = sink.events.map((e) => e.type);
    expect(types).toContain(AgentRuntimeEventType.ExecutorAccepted);
    expect(types[types.length - 1]).toBe(AgentRuntimeEventType.AgentFinished);
    const accepted = sink.events.find(
      (e) => e.type === AgentRuntimeEventType.ExecutorAccepted
    );
    expect(accepted).toMatchObject({ attempt: 1 });
  });

  it("mid-ladder failure with retry", async () => {
    const sink = createInMemoryEventSink();
    const retryableErr = new Error("rate limited");
    const gateway = createFakeModelGateway({
      executorModelIds: ["fake:a", "fake:b", "fake:c"],
      responses: [
        plannerCapture(samplePlan),
        retryableErr,
        executorFinalize(successFinal),
      ],
      errorClassifier: () => classifiedError("rate_limit", true),
    });

    await runAgent({
      input: { prompt: "hi", projectId: "p1" },
      deps: {
        modelGateway: gateway,
        sandboxGateway: createFakeSandboxGateway(),
        toolFactory: createFakeToolFactory(),
        messageStore: createInMemoryMessageStore(),
        telemetryStore: createInMemoryTelemetryStore(),
        eventSink: sink,
        logger: createNoopAgentLogger(),
      },
      config: baseConfig(),
    });

    const started = sink.events.filter(
      (e) => e.type === AgentRuntimeEventType.ExecutorAttemptStarted
    );
    expect(started).toHaveLength(2);
    const failed = sink.events.find(
      (e) => e.type === AgentRuntimeEventType.ExecutorAttemptFailed
    );
    expect(failed).toMatchObject({ retryable: true });
    expect(failed).toMatchObject({
      error: { category: "rate_limit", retryable: true },
    });
    const accepted = sink.events.find(
      (e) => e.type === AgentRuntimeEventType.ExecutorAccepted
    );
    expect(accepted).toMatchObject({ attempt: 2 });
    const finished = sink.events.find(
      (e) => e.type === AgentRuntimeEventType.AgentFinished
    );
    expect(finished).toMatchObject({ error: undefined });
  });

  it("full ladder exhaustion", async () => {
    const sink = createInMemoryEventSink();
    const err = new Error("upstream");
    const gateway = createFakeModelGateway({
      executorModelIds: ["fake:a", "fake:b", "fake:c"],
      responses: [plannerCapture(samplePlan), err, err, err],
      errorClassifier: () =>
        classifiedError("rate_limit", true, "Provider rate limit exceeded"),
    });

    const result = await runAgent({
      input: { prompt: "hi", projectId: "p1" },
      deps: {
        modelGateway: gateway,
        sandboxGateway: createFakeSandboxGateway(),
        toolFactory: createFakeToolFactory(),
        messageStore: createInMemoryMessageStore(),
        telemetryStore: createInMemoryTelemetryStore(),
        eventSink: sink,
        logger: createNoopAgentLogger(),
      },
      config: baseConfig(),
    });

    expect(result.error).toMatchObject({
      category: "rate_limit",
      retryable: true,
      message: "Provider rate limit exceeded",
    });
    expect(result.lastErrorMessage).toContain("upstream");
    expect(Object.isFrozen(result.runState)).toBe(true);
    expect(result.runState.finalOutput).toBeUndefined();
    const failed = sink.events.filter(
      (e) => e.type === AgentRuntimeEventType.ExecutorAttemptFailed
    );
    expect(failed).toHaveLength(3);
    expect(failed[2]).toMatchObject({
      error: {
        category: "rate_limit",
        retryable: true,
        message: "Provider rate limit exceeded",
      },
    });
    const finished = sink.events.find(
      (e) => e.type === AgentRuntimeEventType.AgentFinished
    );
    expect(finished).toMatchObject({
      error: {
        category: "rate_limit",
        retryable: true,
        message: "Provider rate limit exceeded",
      },
    });
    expect(result.finalOutput).toBeUndefined();
  });

  it("transient retry stops on classifier-non-retryable", async () => {
    const sink = createInMemoryEventSink();
    const err = new Error("auth");
    const gateway = createFakeModelGateway({
      executorModelIds: ["fake:a", "fake:b", "fake:c"],
      responses: [plannerCapture(samplePlan), err],
      errorClassifier: () => classifiedError("auth", false),
    });

    await runAgent({
      input: { prompt: "hi", projectId: "p1" },
      deps: {
        modelGateway: gateway,
        sandboxGateway: createFakeSandboxGateway(),
        toolFactory: createFakeToolFactory(),
        messageStore: createInMemoryMessageStore(),
        telemetryStore: createInMemoryTelemetryStore(),
        eventSink: sink,
        logger: createNoopAgentLogger(),
      },
      config: baseConfig(),
    });

    const started = sink.events.filter(
      (e) => e.type === AgentRuntimeEventType.ExecutorAttemptStarted
    );
    expect(started).toHaveLength(1);
    const failed = sink.events.find(
      (e) => e.type === AgentRuntimeEventType.ExecutorAttemptFailed
    );
    expect(failed).toMatchObject({ retryable: false });
    expect(failed).toMatchObject({
      error: { category: "auth", retryable: false },
    });
  });

  it("verification-required escalation", async () => {
    const sink = createInMemoryEventSink();
    const gateway = createFakeModelGateway({
      executorModelIds: ["fake:a", "fake:b", "fake:c"],
      responses: [
        plannerCapture(samplePlan),
        executorEmptyStep(),
        executorFinalize(successFinal),
      ],
    });

    await runAgent({
      input: { prompt: "hi", projectId: "p1" },
      deps: {
        modelGateway: gateway,
        sandboxGateway: createFakeSandboxGateway(),
        toolFactory: createFakeToolFactory(),
        messageStore: createInMemoryMessageStore(),
        telemetryStore: createInMemoryTelemetryStore(),
        eventSink: sink,
        logger: createNoopAgentLogger(),
      },
      config: baseConfig(),
    });

    const escalated = sink.events.filter(
      (e) => e.type === AgentRuntimeEventType.ExecutorEscalated
    );
    expect(escalated.length).toBeGreaterThanOrEqual(1);
    const accepted = sink.events.find(
      (e) => e.type === AgentRuntimeEventType.ExecutorAccepted
    );
    expect(accepted).toMatchObject({ attempt: 2 });
  });

  it("planner fallback when LLM throws", async () => {
    const sink = createInMemoryEventSink();
    const plannerErr = new Error("planner down");
    const gateway = createFakeModelGateway({
      executorModelIds: ["fake:a"],
      responses: [plannerErr, executorFinalize(successFinal)],
    });

    await runAgent({
      input: { prompt: "hi", projectId: "p1" },
      deps: {
        modelGateway: gateway,
        sandboxGateway: createFakeSandboxGateway(),
        toolFactory: createFakeToolFactory(),
        messageStore: createInMemoryMessageStore(),
        telemetryStore: createInMemoryTelemetryStore(),
        eventSink: sink,
        logger: createNoopAgentLogger(),
      },
      config: baseConfig(),
    });

    const types = sink.events.map((e) => e.type);
    const plannerStartedIdx = types.indexOf(
      AgentRuntimeEventType.PlannerStarted
    );
    const plannerFailedIdx = types.indexOf(AgentRuntimeEventType.PlannerFailed);
    const plannerFinishedIdx = types.indexOf(
      AgentRuntimeEventType.PlannerFinished
    );
    expect(plannerStartedIdx).toBeGreaterThanOrEqual(0);
    expect(plannerFailedIdx).toBeGreaterThan(plannerStartedIdx);
    expect(plannerFinishedIdx).toBeGreaterThan(plannerFailedIdx);
    const finished = sink.events.find(
      (e) => e.type === AgentRuntimeEventType.PlannerFinished
    );
    expect(finished).toMatchObject({
      type: AgentRuntimeEventType.PlannerFinished,
    });
    // Default plan must still drive the executor.
    expect(types).toContain(AgentRuntimeEventType.ExecutorAttemptStarted);
  });
});
