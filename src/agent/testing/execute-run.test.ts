import { describe, expect, it } from "vitest";
import { executeRun } from "../application/execute-run";
import { createRunState } from "../domain";
import type { GenerateTextStepResult } from "../ports";
import type { PlanOutput, Thought } from "../domain/types";
import {
  createFakeModelGateway,
  createFakeSandboxGateway,
  createFakeToolFactory,
  createInMemoryEventSink,
  type FakeModelGateway,
} from "./in-memory-stores";
import { createTestLogger, type TestLogger } from "./test-logger";

const samplePlan: PlanOutput = {
  requiresCoding: true,
  taskType: "code_change",
  targetFiles: [],
  verification: "tsc",
  notes: "",
};

function textStep(stepIndex: number, text: string): GenerateTextStepResult {
  return {
    stepIndex,
    text,
    usage: {
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    },
  };
}

function toolStep(params: {
  stepIndex: number;
  text: string;
  toolName: string;
}): GenerateTextStepResult {
  return {
    ...textStep(params.stepIndex, params.text),
    toolCalls: [
      {
        callId: `call_${params.stepIndex}`,
        toolName: params.toolName,
        args: { command: "npm test" },
      },
    ],
  };
}

async function runExecutorWith(params: {
  gateway: FakeModelGateway;
  logger?: TestLogger;
  thoughts?: Thought[];
}) {
  const logger =
    params.logger ?? createTestLogger({ record: true, scope: "run" });
  const thoughts = params.thoughts ?? [];
  const outcome = await executeRun({
    input: {
      previousMessages: [{ role: "user", content: "test" }],
      plan: samplePlan,
      runState: createRunState(),
      thoughts,
      cumulativeUsage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      buildExecutorSystemPrompt: (snippet) => `EXEC ${snippet}`,
      modelId: "fake:exec",
    },
    deps: {
      modelGateway: params.gateway,
      sandboxGateway: createFakeSandboxGateway(),
      toolFactory: createFakeToolFactory(),
      eventSink: createInMemoryEventSink(),
      logger,
    },
  });
  return { logger, outcome, thoughts };
}

describe("executeRun", () => {
  it("records one boundary log per iteration", async () => {
    const gateway = createFakeModelGateway({
      responses: [
        {
          steps: [
            textStep(0, "I will inspect the project."),
            toolStep({
              stepIndex: 1,
              text: "Running the command.",
              toolName: "runCommand",
            }),
          ],
        },
      ],
    });

    const { logger } = await runExecutorWith({ gateway });

    const boundaryEntries = logger.entries.filter(
      (entry) => entry.level === "info" && entry.event === "agent iteration"
    );

    expect(boundaryEntries).toHaveLength(2);
    expect(boundaryEntries[0]).toMatchObject({
      scope: "run:iter",
      bindings: { iteration: 1 },
      metadata: { stepKind: "text", ms: expect.any(Number) },
    });
    expect(boundaryEntries[1]).toMatchObject({
      scope: "run:iter",
      bindings: { iteration: 2 },
      metadata: {
        stepKind: "tool",
        toolName: "runCommand",
        ms: expect.any(Number),
      },
    });
    expect(boundaryEntries.map((entry) => entry.bindings?.iteration)).toEqual([
      1, 2,
    ]);
  });

  it("records context append logs for executor thoughts", async () => {
    const gateway = createFakeModelGateway({
      responses: [
        {
          steps: [
            textStep(0, "First thought."),
            textStep(1, "Second thought."),
          ],
        },
      ],
    });

    const { logger } = await runExecutorWith({ gateway });

    const contextEntries = logger.entries.filter(
      (entry) => entry.event === "context mutation"
    );

    expect(contextEntries).toEqual([
      expect.objectContaining({
        level: "info",
        scope: "run:iter:context",
        bindings: { iteration: 1 },
        metadata: {
          op: "append",
          before: 0,
          after: 1,
          reason: "executor step finished",
        },
      }),
      expect.objectContaining({
        level: "info",
        scope: "run:iter:context",
        bindings: { iteration: 2 },
        metadata: {
          op: "append",
          before: 1,
          after: 2,
          reason: "executor step finished",
        },
      }),
    ]);
  });

  it("records tool-call args verbatim and caps large results", async () => {
    const smallArgs = { path: "src/app.ts", nested: { keep: "verbatim" } };
    const largeOutput = "x".repeat(2100);
    const gateway = createFakeModelGateway({
      responses: [
        async (req) => {
          await req.onToolCallFinish?.({
            callId: "small",
            stepIndex: 0,
            toolName: "readFiles",
            args: smallArgs,
            ok: true,
            durationMs: 3,
            result: { success: true, content: "small" },
          });
          await req.onToolCallFinish?.({
            callId: "large",
            stepIndex: 0,
            toolName: "readFiles",
            args: { path: "big.txt" },
            ok: true,
            durationMs: 4,
            result: largeOutput,
          });
          return { steps: [] };
        },
      ],
    });

    const { logger } = await runExecutorWith({ gateway });

    const toolEntries = logger.entries.filter(
      (entry) => entry.event === "tool call"
    );

    expect(toolEntries).toHaveLength(2);
    expect(toolEntries[0]).toMatchObject({
      level: "debug",
      scope: "run:tool",
      metadata: {
        callId: "small",
        toolName: "readFiles",
        args: smallArgs,
        ok: true,
        result: {
          value: { success: true, content: "small" },
          length: JSON.stringify({ success: true, content: "small" }).length,
          truncated: false,
        },
      },
    });
    expect(toolEntries[1]).toMatchObject({
      level: "debug",
      scope: "run:tool",
      metadata: {
        callId: "large",
        toolName: "readFiles",
        ok: true,
        result: {
          value: largeOutput.slice(0, 2000),
          length: largeOutput.length,
          truncated: true,
        },
      },
    });
  });

  it("logs executor model failures before returning the failed outcome", async () => {
    const error = new Error("executor down");
    const gateway = createFakeModelGateway({ responses: [error] });

    const { logger, outcome } = await runExecutorWith({ gateway });

    expect(outcome.error).toBe(error);
    expect(logger.entries).toContainEqual(
      expect.objectContaining({
        level: "error",
        scope: "run",
        event: "executor failed",
        metadata: expect.objectContaining({
          category: "unknown",
          code: "provider.unknown",
          retryable: false,
          providerError: expect.objectContaining({
            message: "executor down",
            name: "Error",
          }),
        }),
      })
    );
  });
});
