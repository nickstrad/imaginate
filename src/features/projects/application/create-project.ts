import { placeholderName } from "./naming";
import type { ProjectRepository } from "./repository";
import { PROJECT_LIMIT, type AgentMode } from "./types";

export async function createProject(
  input: { userPrompt: string; mode: AgentMode },
  deps: { repository: ProjectRepository }
) {
  const project = await deps.repository.createWithInitialUserMessage({
    name: placeholderName(),
    userPrompt: input.userPrompt,
    mode: input.mode,
  });

  await deps.repository.pruneAfterRecentLimit(PROJECT_LIMIT);

  return {
    project,
    agentRun: {
      kind: "agent.run" as const,
      mode: input.mode,
      projectId: project.id,
      userPrompt: input.userPrompt,
    },
    rename: {
      kind: "project.rename" as const,
      projectId: project.id,
      userPrompt: input.userPrompt,
    },
  };
}
