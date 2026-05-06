import { randomUUID } from "crypto";
import { generateSlug } from "random-word-slugs";
import type { Project } from "@/generated/prisma";
import type { AgentMode, AgentRunIntent } from "@/shared/agent-mode";

export type { AgentMode, AgentRunIntent };

export type ProjectRenameIntent = {
  kind: "project.rename";
  projectId: string;
  userPrompt: string;
};

const PROJECT_LIMIT = 50;
const PROJECT_NAME_MAX_LEN = 40;

export class ProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Project with ID ${projectId} not found.`);
    this.name = "ProjectNotFoundError";
  }
}

export type CreateProjectRecordInput = {
  name: string;
  userPrompt: string;
  mode: AgentMode;
};

export interface ProjectRepository {
  getById(id: string): Promise<Project | null>;
  listRecent(limit: number): Promise<Project[]>;
  createWithInitialUserMessage(
    input: CreateProjectRecordInput
  ): Promise<Project>;
  pruneAfterRecentLimit(limit: number): Promise<void>;
  updateName(id: string, name: string): Promise<void>;
}

export interface ProjectNameGenerator {
  generateRawName(userPrompt: string): Promise<string | null>;
}

function sanitizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, PROJECT_NAME_MAX_LEN)
    .replace(/^-+|-+$/g, "");
}

function uuidSuffix(uuid: string = randomUUID()): string {
  return uuid.slice(0, 5);
}

function placeholderName(
  slug: string = generateSlug(2, { format: "kebab" }),
  suffix: string = uuidSuffix()
): string {
  return `${slug}-${suffix}`.slice(0, PROJECT_NAME_MAX_LEN);
}

function buildProjectName(
  rawBase: string | null,
  suffix: string = uuidSuffix()
): string | null {
  if (!rawBase) {
    return null;
  }
  const base = sanitizeName(rawBase);
  if (base.length < 2) {
    return null;
  }
  return `${base}-${suffix}`.slice(0, PROJECT_NAME_MAX_LEN);
}

export interface ProjectWorkflow {
  create(input: { userPrompt: string; mode: AgentMode }): Promise<{
    project: Project;
    agentRun: AgentRunIntent;
    rename: ProjectRenameIntent;
  }>;
  get(input: { id: string }): Promise<Project>;
  list(): Promise<Project[]>;
  renameFromPrompt(input: {
    projectId: string;
    userPrompt: string;
  }): Promise<{ renamed: true; name: string } | { renamed: false }>;
}

export function createProjectWorkflow(deps: {
  repository: ProjectRepository;
  nameGenerator: ProjectNameGenerator;
}): ProjectWorkflow {
  const { repository, nameGenerator } = deps;
  return {
    async create(input) {
      const project = await repository.createWithInitialUserMessage({
        name: placeholderName(),
        userPrompt: input.userPrompt,
        mode: input.mode,
      });
      await repository.pruneAfterRecentLimit(PROJECT_LIMIT);
      return {
        project,
        agentRun: {
          kind: "agent.run",
          mode: input.mode,
          projectId: project.id,
          userPrompt: input.userPrompt,
        },
        rename: {
          kind: "project.rename",
          projectId: project.id,
          userPrompt: input.userPrompt,
        },
      };
    },
    async get(input) {
      const project = await repository.getById(input.id);
      if (!project) {
        throw new ProjectNotFoundError(input.id);
      }
      return project;
    },
    async list() {
      return repository.listRecent(PROJECT_LIMIT);
    },
    async renameFromPrompt(input) {
      try {
        const rawName = await nameGenerator.generateRawName(input.userPrompt);
        const name = buildProjectName(rawName);
        if (!name) {
          return { renamed: false as const };
        }
        await repository.updateName(input.projectId, name);
        return { renamed: true as const, name };
      } catch {
        return { renamed: false as const };
      }
    },
  };
}
