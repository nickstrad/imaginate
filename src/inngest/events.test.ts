import { describe, it, expect } from "vitest";
import { eventNameForMode, EVENT_NAMES } from "./events";

describe("eventNameForMode", () => {
  it("ask → askAgentRun", () => {
    expect(eventNameForMode("ask")).toBe(EVENT_NAMES.askAgentRun);
  });
  it("code → codeAgentRun", () => {
    expect(eventNameForMode("code")).toBe(EVENT_NAMES.codeAgentRun);
  });
});
