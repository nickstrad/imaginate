import { z } from "zod";

export const PROVIDERS = ["openai", "anthropic", "gemini"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_LABELS: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
};

export const CHEAP_POSTPROC_MODEL: Record<Provider, string> = {
  openai: "gpt-5-nano",
  anthropic: "claude-haiku-4-5-20251001",
  gemini: "gemini-2.5-flash-lite",
};

export const DEFAULT_FALLBACK_MODEL = CHEAP_POSTPROC_MODEL.openai;

export const AVAILABLE_MODELS = {
  openai: [
    { value: "gpt-5-mini", label: "GPT-5 Mini" },
    { value: "gpt-5-nano", label: "GPT-5 Nano" },
  ],
  anthropic: [
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  ],
  gemini: [
    { value: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)" },
    {
      value: "gemini-3.1-flash-lite-preview",
      label: "Gemini 3.1 Flash Lite (Preview)",
    },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  ],
} as const satisfies Record<
  Provider,
  ReadonlyArray<{ value: string; label: string }>
>;

const ALLOWED_MODELS_BY_PROVIDER: Record<Provider, ReadonlySet<string>> = {
  openai: new Set(AVAILABLE_MODELS.openai.map((m) => m.value)),
  anthropic: new Set(AVAILABLE_MODELS.anthropic.map((m) => m.value)),
  gemini: new Set(AVAILABLE_MODELS.gemini.map((m) => m.value)),
};

function allowedModel(provider: Provider) {
  return z
    .string()
    .refine((v) => ALLOWED_MODELS_BY_PROVIDER[provider].has(v), {
      message: `Model not allowed for provider "${provider}".`,
    })
    .optional();
}

export const SelectedModelsSchema = z.object({
  openai: allowedModel("openai"),
  anthropic: allowedModel("anthropic"),
  gemini: allowedModel("gemini"),
});

export type SelectedModels = z.infer<typeof SelectedModelsSchema>;
