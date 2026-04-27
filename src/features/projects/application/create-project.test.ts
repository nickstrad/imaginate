import { describe, expect, it } from "vitest";
import type { Project } from "@/generated/prisma";
import { createProject } from "./create-project";
import { PROJECT_LIMIT } from "./types";
import type { CreateProjectRecordInput, ProjectRepository } from "./repository";

function makeProject(id: string): Project {
  return {
    id,
    name: "placeholder",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

describe("createProject", () => {
  it("creates the project, prunes old projects, and returns queue intents", async () => {
    const created = makeProject("project-1");
    const calls: {
      create?: CreateProjectRecordInput;
      prune?: number;
    } = {};
    const repository: ProjectRepository = {
      getById: async () => null,
      listRecent: async () => [],
      createWithInitialUserMessage: async (input) => {
        calls.create = input;
        return created;
      },
      pruneAfterRecentLimit: async (limit) => {
        calls.prune = limit;
      },
      updateName: async () => undefined,
    };

    const result = await createProject(
      { userPrompt: "Build a CRM", mode: "code" },
      { repository }
    );

    expect(calls.create?.userPrompt).toBe("Build a CRM");
    expect(calls.create?.mode).toBe("code");
    expect(calls.create?.name).toMatch(/.+/);
    expect(calls.prune).toBe(PROJECT_LIMIT);
    expect(result.project).toBe(created);
    expect(result.agentRun).toEqual({
      kind: "agent.run",
      mode: "code",
      projectId: "project-1",
      userPrompt: "Build a CRM",
    });
    expect(result.rename).toEqual({
      kind: "project.rename",
      projectId: "project-1",
      userPrompt: "Build a CRM",
    });
  });
});
