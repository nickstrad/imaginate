import { describe, it, expect } from "vitest";
import { runAgent } from "../application/run-agent";
import {
  AgentRuntimeEventType,
  type AgentRuntimeEvent,
} from "../domain/events";
import {
  createFakeModelGateway,
  createFakeSandboxGateway,
  createFakeToolFactory,
  createInMemoryEventSink,
  createInMemoryMessageStore,
  createInMemoryTelemetryStore,
  createNoopAgentLogger,
} from "./in-memory-stores";
import { createTestLogger } from "./test-logger";
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

function executorToolCallSuccess(output: FinalOutput) {
  return async (req: GenerateTextRequest): Promise<GenerateTextResult> => {
    const args = { files: [{ path: "src/app.ts", content: "ok" }] };
    await req.onToolCallStart?.({
      callId: "call_write_1",
      stepIndex: 0,
      toolName: "writeFiles",
      args,
    });
    await req.onToolCallFinish?.({
      callId: "call_write_1",
      stepIndex: 0,
      toolName: "writeFiles",
      args,
      ok: true,
      durationMs: 12,
      result: { success: true },
    });
    const finalize = req.tools?.finalize;
    if (finalize) {
      await finalize.execute(output);
    }
    return {
      steps: [
        {
          stepIndex: 0,
          text: "wrote",
          toolCalls: [{ callId: "call_write_1", toolName: "writeFiles", args }],
        },
      ],
    };
  };
}

function executorToolCallFailure() {
  return async (req: GenerateTextRequest): Promise<GenerateTextResult> => {
    const args = { command: "npm test" };
    const err = new Error("tool exploded");
    await req.onToolCallStart?.({
      callId: "call_run_1",
      stepIndex: 0,
      toolName: "runCommand",
      args,
    });
    await req.onToolCallFinish?.({
      callId: "call_run_1",
      stepIndex: 0,
      toolName: "runCommand",
      args,
      ok: false,
      durationMs: 7,
      error: err,
    });
    throw err;
  };
}

function eventOfType<T extends AgentRuntimeEvent["type"]>(
  events: ReadonlyArray<AgentRuntimeEvent>,
  type: T
): Extract<AgentRuntimeEvent, { type: T }> {
  const event = events.find((candidate) => candidate.type === type);
  if (!event) {
    throw new Error(`missing event: ${type}`);
  }
  return event as Extract<AgentRuntimeEvent, { type: T }>;
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

type TestModelGateway = ReturnType<typeof createFakeModelGateway>;
type TestEventSink = ReturnType<typeof createInMemoryEventSink>;

function createRunDeps(
  gateway: TestModelGateway,
  sink: TestEventSink,
  logger = createNoopAgentLogger()
) {
  return {
    modelGateway: gateway,
    sandboxGateway: createFakeSandboxGateway(),
    toolFactory: createFakeToolFactory(),
    messageStore: createInMemoryMessageStore(),
    telemetryStore: createInMemoryTelemetryStore(),
    eventSink: sink,
    logger,
  };
}

function runTestAgent(gateway: TestModelGateway, sink: TestEventSink) {
  return runAgent({
    input: {
      projectId: "p1",
      previousMessages: [{ role: "user", content: "hi" }],
    },
    deps: createRunDeps(gateway, sink),
    config: baseConfig(),
  });
}

describe("runAgent", () => {
  it("success on first ladder slot", async () => {
    const sink = createInMemoryEventSink();
    const gateway = createFakeModelGateway({
      executorModelIds: ["fake:a", "fake:b", "fake:c"],
      responses: [plannerCapture(samplePlan), executorFinalize(successFinal)],
    });

    const result = await runTestAgent(gateway, sink);

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

  it("emits paired tool-call events before the step finishes", async () => {
    const sink = createInMemoryEventSink();
    const gateway = createFakeModelGateway({
      executorModelIds: ["fake:a"],
      responses: [
        plannerCapture(samplePlan),
        executorToolCallSuccess(successFinal),
      ],
    });

    await runTestAgent(gateway, sink);

    const types = sink.events.map((e) => e.type);
    const requestedIdx = types.indexOf(AgentRuntimeEventType.ToolCallRequested);
    const completedIdx = types.indexOf(AgentRuntimeEventType.ToolCallCompleted);
    const stepIdx = types.indexOf(AgentRuntimeEventType.ExecutorStepFinished);
    expect(requestedIdx).toBeGreaterThanOrEqual(0);
    expect(completedIdx).toBeGreaterThan(requestedIdx);
    expect(stepIdx).toBeGreaterThan(completedIdx);

    expect(
      eventOfType(sink.events, AgentRuntimeEventType.ToolCallRequested)
    ).toMatchObject({
      callId: "call_write_1",
      stepIndex: 0,
      toolName: "writeFiles",
      args: { files: [{ path: "src/app.ts", content: "ok" }] },
    });
    expect(
      eventOfType(sink.events, AgentRuntimeEventType.ToolCallCompleted)
    ).toMatchObject({
      callId: "call_write_1",
      stepIndex: 0,
      toolName: "writeFiles",
      ok: true,
      result: { success: true },
    });
    expect(
      eventOfType(sink.events, AgentRuntimeEventType.ExecutorStepFinished)
    ).toMatchObject({
      toolCallIds: ["call_write_1"],
      step: {
        thought: {
          toolCalls: [
            {
              callId: "call_write_1",
              toolName: "writeFiles",
            },
          ],
        },
      },
    });
  });

  it("emits structured tool-call errors", async () => {
    const sink = createInMemoryEventSink();
    const gateway = createFakeModelGateway({
      executorModelIds: ["fake:a"],
      responses: [plannerCapture(samplePlan), executorToolCallFailure()],
    });

    await runTestAgent(gateway, sink);

    expect(
      eventOfType(sink.events, AgentRuntimeEventType.ToolCallCompleted)
    ).toMatchObject({
      callId: "call_run_1",
      stepIndex: 0,
      toolName: "runCommand",
      ok: false,
      error: {
        code: "runtime.tool_failed",
        category: "tool_failed",
        retryable: false,
        message: "Tool call failed: tool exploded",
      },
    });
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

    await runTestAgent(gateway, sink);

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

    const result = await runTestAgent(gateway, sink);

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

    await runTestAgent(gateway, sink);

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

    await runTestAgent(gateway, sink);

    const escalated = sink.events.filter(
      (e) => e.type === AgentRuntimeEventType.ExecutorEscalated
    );
    expect(escalated.length).toBeGreaterThanOrEqual(1);
    const accepted = sink.events.find(
      (e) => e.type === AgentRuntimeEventType.ExecutorAccepted
    );
    expect(accepted).toMatchObject({ attempt: 2 });
  });

  it("logs and propagates planner failures", async () => {
    const sink = createInMemoryEventSink();
    const logger = createTestLogger({ record: true, scope: "agent" });
    const plannerErr = new Error("planner down");
    const gateway = createFakeModelGateway({
      executorModelIds: ["fake:a"],
      responses: [plannerErr, executorFinalize(successFinal)],
    });

    await expect(
      runAgent({
        input: {
          projectId: "p1",
          previousMessages: [{ role: "user", content: "hi" }],
        },
        deps: createRunDeps(gateway, sink, logger),
        config: baseConfig(),
      })
    ).rejects.toThrow("planner down");

    const types = sink.events.map((e) => e.type);
    const plannerStartedIdx = types.indexOf(
      AgentRuntimeEventType.PlannerStarted
    );
    const plannerFailedIdx = types.indexOf(AgentRuntimeEventType.PlannerFailed);
    expect(plannerStartedIdx).toBeGreaterThanOrEqual(0);
    expect(plannerFailedIdx).toBeGreaterThan(plannerStartedIdx);
    expect(types).not.toContain(AgentRuntimeEventType.PlannerFinished);
    expect(types).not.toContain(AgentRuntimeEventType.ExecutorAttemptStarted);
    expect(logger.entries).toContainEqual(
      expect.objectContaining({
        level: "error",
        scope: "agent:run",
        event: "planner failed",
        metadata: { err: plannerErr },
      })
    );
  });
});
