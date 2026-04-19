import "server-only";
import { z } from "zod";
import { PROVIDERS, type Provider } from "./providers";

const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
});

const parsed = EnvSchema.parse({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || undefined,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || undefined,
});

const providerKeys: Record<Provider, string | null> = {
  openai: parsed.OPENAI_API_KEY ?? null,
  anthropic: parsed.ANTHROPIC_API_KEY ?? null,
  gemini: parsed.GEMINI_API_KEY ?? null,
};

export function getProviderKey(provider: Provider): string | null {
  return providerKeys[provider];
}

export function isProviderAvailable(provider: Provider): boolean {
  return providerKeys[provider] !== null;
}

export function getAvailableProviders(): Provider[] {
  return PROVIDERS.filter(isProviderAvailable);
}

export function getUnavailableProviders(): Provider[] {
  return PROVIDERS.filter((p) => !isProviderAvailable(p));
}

export function getProviderAvailabilityMap(): Record<Provider, boolean> {
  return {
    openai: isProviderAvailable("openai"),
    anthropic: isProviderAvailable("anthropic"),
    gemini: isProviderAvailable("gemini"),
  };
}
