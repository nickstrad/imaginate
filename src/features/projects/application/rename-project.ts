import { buildProjectName } from "./naming";
import type { ProjectRepository } from "./repository";

export interface ProjectNameGenerator {
  generateRawName(userPrompt: string): Promise<string | null>;
}

export async function renameProjectFromPrompt(
  input: { projectId: string; userPrompt: string },
  deps: {
    repository: ProjectRepository;
    nameGenerator: ProjectNameGenerator;
  }
) {
  try {
    const rawName = await deps.nameGenerator.generateRawName(input.userPrompt);
    const name = buildProjectName(rawName);
    if (!name) {
      return { renamed: false as const };
    }
    await deps.repository.updateName(input.projectId, name);
    return { renamed: true as const, name };
  } catch {
    return { renamed: false as const };
  }
}
