import { describe, it, expect } from "vitest";
import {
  AgentRunEventDataSchema,
  eventNameForMode,
  EVENT_NAMES,
  ProjectRenameEventDataSchema,
} from "./events";

describe("eventNameForMode", () => {
  it("ask → askAgentRun", () => {
    expect(eventNameForMode("ask")).toBe(EVENT_NAMES.askAgentRun);
  });
  it("code → codeAgentRun", () => {
    expect(eventNameForMode("code")).toBe(EVENT_NAMES.codeAgentRun);
  });
});

describe("Inngest event schemas", () => {
  it("parses agent run event data", () => {
    expect(
      AgentRunEventDataSchema.parse({
        projectId: "project-1",
        userPrompt: "Build a dashboard",
      })
    ).toEqual({
      projectId: "project-1",
      userPrompt: "Build a dashboard",
    });
  });

  it("parses project rename event data", () => {
    expect(
      ProjectRenameEventDataSchema.parse({
        projectId: "project-1",
        userPrompt: "Build a dashboard",
      })
    ).toEqual({
      projectId: "project-1",
      userPrompt: "Build a dashboard",
    });
  });
});
