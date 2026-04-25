import "server-only";
import { type Provider } from "./providers";
import { env } from "./config/env";

const providerKeys: Record<Provider, string | null> = {
  openrouter: env.OPENROUTER_API_KEY ?? null,
};

export function getProviderKey(provider: Provider): string | null {
  return providerKeys[provider];
}

export function isProviderAvailable(provider: Provider): boolean {
  return providerKeys[provider] !== null;
}

export function getProviderAvailabilityMap(): Record<Provider, boolean> {
  return {
    openrouter: isProviderAvailable("openrouter"),
  };
}
