import { generateText } from "ai";
import { createModelProvider, resolvePlannerModel } from "@/platform/models";
import { getAgentPrompts } from "@/shared/prompts";
import type { ProjectNameGenerator } from "../application";

const PROMPT_TRUNCATE_CHARS = 2000;

export function createAiProjectNameGenerator(): ProjectNameGenerator {
  const prompts = getAgentPrompts();
  return {
    async generateRawName(userPrompt: string): Promise<string | null> {
      try {
        const model = createModelProvider(resolvePlannerModel());
        const { text } = await generateText({
          model,
          system: prompts.projectNaming,
          prompt: userPrompt.slice(0, PROMPT_TRUNCATE_CHARS),
        });
        return text;
      } catch {
        return null;
      }
    },
  };
}
