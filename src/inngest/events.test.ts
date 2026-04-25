import { describe, it, expect } from "vitest";
import { eventNameForMode, messageModeForMode, EVENT_NAMES } from "./events";

describe("eventNameForMode", () => {
  it("ask → askAgentRun", () => {
    expect(eventNameForMode("ask")).toBe(EVENT_NAMES.askAgentRun);
  });
  it("code → codeAgentRun", () => {
    expect(eventNameForMode("code")).toBe(EVENT_NAMES.codeAgentRun);
  });
});

describe("messageModeForMode", () => {
  it("maps modes to enum values", () => {
    expect(messageModeForMode("ask")).toBe("ASK");
    expect(messageModeForMode("code")).toBe("CODE");
  });
});
