import type { MessageRepository } from "./repository";

export async function listMessages(
  input: { projectId: string },
  deps: { repository: MessageRepository }
) {
  return deps.repository.listByProjectId(input.projectId);
}
