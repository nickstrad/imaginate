import { describe, it, expect } from "vitest";
import {
  EscalateReason,
  extractTaskSummary,
  shouldEscalate,
  stepTextOf,
} from "./decisions";
import { createRunState, markVerification } from "./state";

describe("stepTextOf", () => {
  it("returns top-level text", () => {
    expect(stepTextOf({ text: "hello" })).toBe("hello");
  });
  it("concatenates content text parts", () => {
    expect(
      stepTextOf({
        content: [
          { type: "text", text: "foo" },
          { type: "tool_call" },
          { type: "text", text: "bar" },
        ],
      })
    ).toBe("foobar");
  });
  it("returns empty string for non-objects", () => {
    expect(stepTextOf(null)).toBe("");
    expect(stepTextOf("hi")).toBe("");
  });
});

describe("extractTaskSummary", () => {
  it("finds the summary in the first matching candidate", () => {
    expect(
      extractTaskSummary([
        "no match here",
        "<task_summary>did the thing</task_summary>",
      ])
    ).toBe("did the thing");
  });
  it("returns null when no candidate matches", () => {
    expect(extractTaskSummary(["", "nothing"])).toBeNull();
  });
});

describe("shouldEscalate", () => {
  it("finalOutput failed → escalate", () => {
    const s = createRunState();
    s.finalOutput = {
      status: "failed",
      title: "t",
      summary: "x",
      verification: [],
      nextSteps: [],
    };
    expect(shouldEscalate(s, {})).toEqual({
      escalate: true,
      reason: EscalateReason.FinalizeFailed,
    });
  });
  it("finalOutput partial → escalate", () => {
    const s = createRunState();
    s.finalOutput = {
      status: "partial",
      title: "t",
      summary: "x",
      verification: [],
      nextSteps: [],
    };
    expect(shouldEscalate(s, {}).reason).toBe(EscalateReason.FinalizePartial);
  });
  it("finalOutput complete → no escalate", () => {
    const s = createRunState();
    s.finalOutput = {
      status: "success",
      title: "ok",
      summary: "ok",
      verification: [],
      nextSteps: [],
    };
    expect(shouldEscalate(s, {})).toEqual({ escalate: false });
  });
  it("empty result text → escalate empty_output", () => {
    expect(shouldEscalate(createRunState(), {}).reason).toBe(
      EscalateReason.EmptyOutput
    );
  });
  it("stub language → escalate", () => {
    expect(
      shouldEscalate(createRunState(), { text: "I'll add a TODO here" }).reason
    ).toBe(EscalateReason.StubLanguage);
  });
  it("wrote files but no verification → escalate", () => {
    const s = createRunState();
    s.filesWritten = { "a.ts": "..." };
    expect(shouldEscalate(s, { text: "done" }).reason).toBe(
      EscalateReason.WroteWithoutVerify
    );
  });
  it("no writes at all → escalate no_writes", () => {
    expect(shouldEscalate(createRunState(), { text: "done" }).reason).toBe(
      EscalateReason.NoWrites
    );
  });
  it("wrote and verified → no escalate", () => {
    const s = createRunState();
    s.filesWritten = { "a.ts": "..." };
    markVerification(s, "build", "tsc", true);
    expect(shouldEscalate(s, { text: "done" })).toEqual({ escalate: false });
  });
});
