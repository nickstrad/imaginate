import "server-only";
import { env } from "@/platform/config/env";
import { PROVIDERS, type Provider } from "./types";

const providerKeys: Record<Provider, string | null> = {
  [PROVIDERS.LM_STUDIO]: env.LM_STUDIO_API_KEY ?? null,
  [PROVIDERS.OPENROUTER]: env.OPENROUTER_API_KEY ?? null,
};

export function getProviderKey(provider: Provider): string | null {
  return providerKeys[provider];
}

export function isProviderAvailable(provider: Provider): boolean {
  if (provider === PROVIDERS.LM_STUDIO) {
    return env.LM_STUDIO_BASE_URL.length > 0 && env.LM_STUDIO_MODEL.length > 0;
  }
  return providerKeys[provider] !== null;
}

export function getProviderAvailabilityMap(): Record<Provider, boolean> {
  return {
    [PROVIDERS.LM_STUDIO]: isProviderAvailable(PROVIDERS.LM_STUDIO),
    [PROVIDERS.OPENROUTER]: isProviderAvailable(PROVIDERS.OPENROUTER),
  };
}
