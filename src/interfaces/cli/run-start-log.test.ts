import { describe, expect, it } from "vitest";
import { logRunStart } from "./run-start-log";

describe("logRunStart", () => {
  it("emits one structured info entry with project context", () => {
    const entries: Array<{
      event: string;
      metadata?: Record<string, unknown>;
    }> = [];

    logRunStart({
      logger: {
        info: (entry) => {
          entries.push(entry);
        },
      },
      projectId: "local",
      sandboxMode: "local",
    });

    expect(entries).toEqual([
      {
        event: "run start",
        metadata: {
          projectId: "local",
          sandboxMode: "local",
        },
      },
    ]);
  });
});
