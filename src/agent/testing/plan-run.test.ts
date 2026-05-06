import { describe, expect, it } from "vitest";
import { planRun } from "../application/plan-run";
import {
  createFakeModelGateway,
  createFakeToolFactory,
  createInMemoryEventSink,
} from "./in-memory-stores";
import { createTestLogger } from "./test-logger";

describe("planRun", () => {
  it("passes its logger to the model gateway for LLM call logging", async () => {
    const logger = createTestLogger({ record: true, scope: "run" });
    const gateway = createFakeModelGateway();

    await planRun({
      input: {
        previousMessages: [{ role: "user", content: "make a plan" }],
        plannerSystemPrompt: "PLAN",
      },
      deps: {
        modelGateway: gateway,
        toolFactory: createFakeToolFactory(),
        eventSink: createInMemoryEventSink(),
        logger,
      },
    });

    expect(gateway.calls[0]?.logger).toBe(logger);
  });

  it("logs and rethrows planning LLM failures", async () => {
    const logger = createTestLogger({ record: true, scope: "run" });
    const error = new Error("planner down");
    const gateway = createFakeModelGateway({ responses: [error] });

    await expect(
      planRun({
        input: {
          previousMessages: [{ role: "user", content: "make a plan" }],
          plannerSystemPrompt: "PLAN",
        },
        deps: {
          modelGateway: gateway,
          toolFactory: createFakeToolFactory(),
          eventSink: createInMemoryEventSink(),
          logger,
        },
      })
    ).rejects.toThrow("planner down");

    expect(logger.entries).toEqual([
      expect.objectContaining({
        level: "error",
        scope: "run",
        event: "planner failed",
        metadata: { err: error },
      }),
    ]);
  });
});
