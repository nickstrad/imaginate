import type { Project } from "@/generated/prisma";
import type { AgentMode } from "./types";

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
