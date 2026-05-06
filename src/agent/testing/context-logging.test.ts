import { describe, expect, it } from "vitest";
import { logContextMutation } from "../application/context-logging";
import { createTestLogger } from "./test-logger";

describe("logContextMutation", () => {
  it("emits the shared context mutation shape for every operation", () => {
    const logger = createTestLogger({ record: true, scope: "run" });

    logContextMutation({
      logger,
      op: "append",
      before: 0,
      after: 1,
      reason: "new thought",
    });
    logContextMutation({
      logger,
      op: "trim",
      before: 8,
      after: 5,
      reason: "message window limit",
    });
    logContextMutation({
      logger,
      op: "summarize",
      before: 5,
      after: 2,
      reason: "context budget",
    });
    logContextMutation({
      logger,
      op: "replace",
      before: 2,
      after: 2,
      reason: "summary refresh",
    });

    expect(logger.entries.map((entry) => entry.metadata)).toEqual([
      { op: "append", before: 0, after: 1, reason: "new thought" },
      { op: "trim", before: 8, after: 5, reason: "message window limit" },
      { op: "summarize", before: 5, after: 2, reason: "context budget" },
      { op: "replace", before: 2, after: 2, reason: "summary refresh" },
    ]);
    expect(
      logger.entries.every(
        (entry) =>
          entry.level === "info" &&
          entry.scope === "run:context" &&
          entry.event === "context mutation" &&
          typeof entry.metadata?.reason === "string" &&
          entry.metadata.reason.length > 0
      )
    ).toBe(true);
  });
});
