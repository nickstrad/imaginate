import { describe, expect, it } from "vitest";
import type { Project } from "@/generated/prisma";
import {
  createProjectWorkflow,
  ProjectNotFoundError,
  type CreateProjectRecordInput,
  type ProjectNameGenerator,
  type ProjectRepository,
} from ".";

function makeProject(over: Partial<Project> & { id: string }): Project {
  return {
    id: over.id,
    name: over.name ?? "placeholder-name",
    createdAt: over.createdAt ?? new Date("2026-01-01T00:00:00Z"),
    updatedAt: over.updatedAt ?? new Date("2026-01-01T00:00:00Z"),
  };
}

type RepoState = {
  byId: Map<string, Project>;
  recent: Project[];
  created: CreateProjectRecordInput[];
  pruned: number[];
  renames: { id: string; name: string }[];
};

function blankState(): RepoState {
  return {
    byId: new Map(),
    recent: [],
    created: [],
    pruned: [],
    renames: [],
  };
}

function makeRepository(state: RepoState): ProjectRepository {
  return {
    getById: async (id) => state.byId.get(id) ?? null,
    listRecent: async () => state.recent,
    createWithInitialUserMessage: async (input) => {
      state.created.push(input);
      const project = makeProject({
        id: `project-${state.created.length}`,
        name: input.name,
      });
      state.byId.set(project.id, project);
      return project;
    },
    pruneAfterRecentLimit: async (limit) => {
      state.pruned.push(limit);
    },
    updateName: async (id, name) => {
      state.renames.push({ id, name });
    },
  };
}

function nameGenerator(returns: string | null): ProjectNameGenerator {
  return { generateRawName: async () => returns };
}

function throwingNameGenerator(): ProjectNameGenerator {
  return {
    generateRawName: async () => {
      throw new Error("provider failed");
    },
  };
}

describe("createProjectWorkflow.create", () => {
  it("creates the project, prunes after the limit, and emits the queue intents", async () => {
    const state = blankState();
    const wf = createProjectWorkflow({
      repository: makeRepository(state),
      nameGenerator: nameGenerator("ignored-by-create"),
    });
    const result = await wf.create({ userPrompt: "Build a CRM", mode: "code" });
    expect(state.created).toHaveLength(1);
    expect(state.created[0].userPrompt).toBe("Build a CRM");
    expect(state.created[0].mode).toBe("code");
    expect(state.created[0].name).toMatch(/.+/);
    expect(state.pruned).toEqual([50]);
    expect(result.project.id).toBe("project-1");
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

describe("createProjectWorkflow.get", () => {
  it("returns a project when one is found", async () => {
    const state = blankState();
    const project = makeProject({ id: "project-1", name: "found" });
    state.byId.set(project.id, project);
    const wf = createProjectWorkflow({
      repository: makeRepository(state),
      nameGenerator: nameGenerator(null),
    });
    await expect(wf.get({ id: "project-1" })).resolves.toBe(project);
  });

  it("throws ProjectNotFoundError when no project is found", async () => {
    const state = blankState();
    const wf = createProjectWorkflow({
      repository: makeRepository(state),
      nameGenerator: nameGenerator(null),
    });
    await expect(wf.get({ id: "missing" })).rejects.toBeInstanceOf(
      ProjectNotFoundError
    );
  });
});

describe("createProjectWorkflow.list", () => {
  it("returns the recent list from the repository", async () => {
    const state = blankState();
    const project = makeProject({ id: "p-1" });
    state.recent = [project];
    const wf = createProjectWorkflow({
      repository: makeRepository(state),
      nameGenerator: nameGenerator(null),
    });
    await expect(wf.list()).resolves.toEqual([project]);
  });
});

describe("createProjectWorkflow.renameFromPrompt", () => {
  it("sanitizes the LLM-generated name to kebab-case and writes it", async () => {
    const state = blankState();
    const wf = createProjectWorkflow({
      repository: makeRepository(state),
      nameGenerator: nameGenerator("Analytics Dashboard!"),
    });
    const result = await wf.renameFromPrompt({
      projectId: "project-1",
      userPrompt: "make an analytics dashboard",
    });
    expect(result.renamed).toBe(true);
    expect(state.renames).toHaveLength(1);
    expect(state.renames[0].id).toBe("project-1");
    expect(state.renames[0].name).toMatch(/^analytics-dashboard-/);
  });

  it("returns renamed:false when the generator throws", async () => {
    const state = blankState();
    const wf = createProjectWorkflow({
      repository: makeRepository(state),
      nameGenerator: throwingNameGenerator(),
    });
    const result = await wf.renameFromPrompt({
      projectId: "project-1",
      userPrompt: "make a dashboard",
    });
    expect(result).toEqual({ renamed: false });
    expect(state.renames).toEqual([]);
  });

  it("returns renamed:false when the generator returns null", async () => {
    const state = blankState();
    const wf = createProjectWorkflow({
      repository: makeRepository(state),
      nameGenerator: nameGenerator(null),
    });
    const result = await wf.renameFromPrompt({
      projectId: "project-1",
      userPrompt: "make a dashboard",
    });
    expect(result).toEqual({ renamed: false });
  });

  it("returns renamed:false when the generator yields garbage that sanitizes to nothing", async () => {
    const state = blankState();
    const wf = createProjectWorkflow({
      repository: makeRepository(state),
      nameGenerator: nameGenerator("!!!"),
    });
    const result = await wf.renameFromPrompt({
      projectId: "project-1",
      userPrompt: "!!!",
    });
    expect(result).toEqual({ renamed: false });
  });
});
