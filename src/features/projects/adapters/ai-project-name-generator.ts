import { generateText } from "ai";
import { createModelProvider, resolvePlannerModel } from "@/platform/models";
import { PROJECT_NAMING_PROMPT } from "@/shared/prompts";
import type { ProjectNameGenerator } from "../application";

const PROMPT_TRUNCATE_CHARS = 2000;

export function createAiProjectNameGenerator(): ProjectNameGenerator {
  return {
    async generateRawName(userPrompt: string): Promise<string | null> {
      try {
        const model = createModelProvider(resolvePlannerModel());
        const { text } = await generateText({
          model,
          system: PROJECT_NAMING_PROMPT,
          prompt: userPrompt.slice(0, PROMPT_TRUNCATE_CHARS),
        });
        return text;
      } catch {
        return null;
      }
    },
  };
}
