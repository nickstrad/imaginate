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
} from "./in-memory-stores";
import { createTestLogger } from "./test-logger";

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

describe("executeRun", () => {
  it("records one boundary log per iteration", async () => {
    const logger = createTestLogger({ record: true, scope: "run" });
    const thoughts: Thought[] = [];
    const eventSink = createInMemoryEventSink();
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

    await executeRun({
      input: {
        userPrompt: "test",
        previousMessages: [],
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
        modelGateway: gateway,
        sandboxGateway: createFakeSandboxGateway(),
        toolFactory: createFakeToolFactory(),
        eventSink,
        logger,
      },
    });

    const boundaryEntries = logger.entries.filter(
      (entry) => entry.level === "info" && entry.event === "agent iteration"
    );
    const infoEntries = logger.entries.filter(
      (entry) => entry.level === "info"
    );

    expect(boundaryEntries).toHaveLength(2);
    expect(infoEntries).toEqual(boundaryEntries);
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
});
