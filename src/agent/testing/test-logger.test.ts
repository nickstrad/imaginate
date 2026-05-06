import { describe, expect, it } from "vitest";
import { createTestLogger, TEST_LOG_LEVELS } from "./test-logger";

describe("createTestLogger", () => {
  it("defaults to a noop logger", () => {
    const logger = createTestLogger();

    logger.info({ event: "ignored", metadata: { value: 1 } });
    logger.child({ scope: "child", bindings: { child: true } }).warn({
      event: "also ignored",
    });

    expect(logger.entries).toEqual([]);
  });

  it("records every level with scope, bindings, and metadata", () => {
    const logger = createTestLogger({
      record: true,
      scope: "root",
      bindings: { runId: "run_1" },
    });

    for (const [index, level] of TEST_LOG_LEVELS.entries()) {
      logger[level]({ event: level, metadata: { index } });
    }

    expect(logger.entries).toEqual(
      TEST_LOG_LEVELS.map((level, index) => ({
        level,
        scope: "root",
        event: level,
        bindings: { runId: "run_1" },
        metadata: { index },
      }))
    );
  });

  it("inherits parent bindings into child entries", () => {
    const logger = createTestLogger({
      record: true,
      scope: "agent",
      bindings: { runId: "run_1" },
    });

    const child = logger.child({
      scope: "iter",
      bindings: { iteration: 2 },
    });
    child.info({ event: "boundary", metadata: { ms: 12 } });

    expect(logger.entries).toEqual([
      {
        level: "info",
        scope: "agent:iter",
        event: "boundary",
        bindings: { runId: "run_1", iteration: 2 },
        metadata: { ms: 12 },
      },
    ]);
  });
});
