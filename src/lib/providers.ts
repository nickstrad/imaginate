import { z } from "zod";

export const PROVIDERS = ["openai", "anthropic", "gemini"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_LABELS: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
};

export const DEFAULT_FALLBACK_MODEL = "gpt-5-nano";

export const SelectedModelsSchema = z.object({
  openai: z.string().optional(),
  anthropic: z.string().optional(),
  gemini: z.string().optional(),
});

export type SelectedModels = z.infer<typeof SelectedModelsSchema>;
