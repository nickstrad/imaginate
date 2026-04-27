import type { ProjectRepository } from "./repository";
import { PROJECT_LIMIT } from "./types";

export async function listProjects(deps: { repository: ProjectRepository }) {
  return deps.repository.listRecent(PROJECT_LIMIT);
}
