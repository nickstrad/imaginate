import "server-only";
import { PROVIDERS, type Provider } from "./providers";
import { env } from "./config/env";

const providerKeys: Record<Provider, string | null> = {
  openai: env.OPENAI_API_KEY ?? null,
  anthropic: env.ANTHROPIC_API_KEY ?? null,
  gemini: env.GEMINI_API_KEY ?? null,
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
