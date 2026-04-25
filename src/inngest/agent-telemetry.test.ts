import { describe, it, expect, vi } from "vitest";
import {
  buildTelemetry,
  extractTelemetry,
  persistTelemetryWith,
  readUsage,
  summarizeVerification,
  toPersistedTelemetry,
  type TelemetryStore,
} from "./agent-telemetry";
import { createRunState, markVerification } from "./agent-config";

describe("readUsage", () => {
  it("normalizes promptTokens / inputTokens", () => {
    expect(readUsage({ inputTokens: 5, outputTokens: 7 })).toEqual({
      promptTokens: 5,
      completionTokens: 7,
      totalTokens: 0,
    });
  });
  it("prefers explicit promptTokens over inputTokens", () => {
    expect(readUsage({ promptTokens: 1, inputTokens: 999 }).promptTokens).toBe(
      1
    );
  });
  it("handles undefined", () => {
    expect(readUsage(undefined)).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });
});

describe("summarizeVerification", () => {
  it("counts success/failure and detects build success", () => {
    const s = createRunState();
    markVerification(s, "build", "tsc", true);
    markVerification(s, "test", "vitest", true);
    markVerification(s, "lint", "eslint", false);
    expect(summarizeVerification(s)).toEqual({
      success: 2,
      failure: 1,
      buildSucceeded: true,
    });
  });

  it("buildSucceeded false if only test/lint passed", () => {
    const s = createRunState();
    markVerification(s, "test", "vitest", true);
    expect(summarizeVerification(s).buildSucceeded).toBe(false);
  });
});

describe("buildTelemetry", () => {
  it("aggregates run state and zero-tokens become null", () => {
    const s = createRunState();
    s.filesRead = ["a.ts", "b.ts"];
    s.filesWritten = { "x.ts": "..." };
    s.commandsRun = [{ command: "ls", success: true }];
    s.totalAttempts = 2;
    s.escalatedTo = "anthropic-haiku";
    markVerification(s, "build", "tsc", true);

    const t = buildTelemetry(s, 10, {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
    expect(t).toMatchObject({
      steps: 10,
      filesRead: 2,
      filesWritten: 1,
      commandsRun: 1,
      buildSucceeded: true,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      totalAttempts: 2,
      escalatedTo: "anthropic-haiku",
      verificationSuccessCount: 1,
      verificationFailureCount: 0,
    });
  });
});

describe("extractTelemetry", () => {
  it("derives steps from result.steps array length", () => {
    const t = extractTelemetry(
      { steps: [{}, {}, {}], usage: { promptTokens: 1, totalTokens: 2 } },
      createRunState()
    );
    expect(t.steps).toBe(3);
    expect(t.promptTokens).toBe(1);
  });

  it("handles undefined result", () => {
    const t = extractTelemetry(undefined, createRunState());
    expect(t.steps).toBe(0);
  });
});

describe("persistTelemetryWith", () => {
  it("upserts using messageId and persisted shape", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const store: TelemetryStore = { upsert };
    const payload = buildTelemetry(createRunState(), 1, {
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    });
    await persistTelemetryWith(store, "msg_1", payload);
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ messageId: "msg_1" });
    expect(arg.create).toMatchObject({
      messageId: "msg_1",
      ...toPersistedTelemetry(payload),
    });
    expect(arg.update).toEqual(toPersistedTelemetry(payload));
  });
});
