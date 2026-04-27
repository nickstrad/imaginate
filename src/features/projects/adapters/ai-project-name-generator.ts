import { generateText } from "ai";
import { createModelProvider, MODEL_REGISTRY } from "@/platform/models";
import { PROJECT_NAMING_PROMPT } from "@/shared/prompts";
import { getProviderKey } from "@/platform/providers";
import type { ProjectNameGenerator } from "../application";

const PROMPT_TRUNCATE_CHARS = 2000;

export function createAiProjectNameGenerator(): ProjectNameGenerator {
  return {
    async generateRawName(userPrompt: string): Promise<string | null> {
      const apiKey = getProviderKey(MODEL_REGISTRY.planner.provider);
      if (!apiKey) {
        return null;
      }

      try {
        const model = createModelProvider({
          ...MODEL_REGISTRY.planner,
          apiKey,
        });
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
