import { ProjectNotFoundError, type ProjectRepository } from "./repository";

export async function getProject(
  input: { id: string },
  deps: { repository: ProjectRepository }
) {
  const project = await deps.repository.getById(input.id);
  if (!project) {
    throw new ProjectNotFoundError(input.id);
  }
  return project;
}
