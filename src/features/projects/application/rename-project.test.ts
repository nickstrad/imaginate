import { describe, expect, it } from "vitest";
import type { Project } from "@/generated/prisma";
import { renameProjectFromPrompt } from "./rename-project";
import type { ProjectRepository } from "./repository";

function repositoryWithRename(calls: string[]): ProjectRepository {
  return {
    getById: async (): Promise<Project | null> => null,
    listRecent: async () => [],
    createWithInitialUserMessage: async () => {
      throw new Error("not used");
    },
    pruneAfterRecentLimit: async () => undefined,
    updateName: async (_id, name) => {
      calls.push(name);
    },
  };
}

describe("renameProjectFromPrompt", () => {
  it("generates and saves a sanitized project name", async () => {
    const names: string[] = [];
    const result = await renameProjectFromPrompt(
      { projectId: "project-1", userPrompt: "make an analytics dashboard" },
      {
        repository: repositoryWithRename(names),
        nameGenerator: {
          generateRawName: async () => "Analytics Dashboard!",
        },
      }
    );

    expect(result.renamed).toBe(true);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^analytics-dashboard-/);
  });

  it("does not throw when naming fails", async () => {
    const names: string[] = [];
    const result = await renameProjectFromPrompt(
      { projectId: "project-1", userPrompt: "!!!" },
      {
        repository: repositoryWithRename(names),
        nameGenerator: {
          generateRawName: async () => {
            throw new Error("provider failed");
          },
        },
      }
    );

    expect(result).toEqual({ renamed: false });
    expect(names).toEqual([]);
  });
});
