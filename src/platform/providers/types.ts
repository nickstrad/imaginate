export const PROVIDERS = {
  OPENROUTER: "openrouter",
  LM_STUDIO: "lmstudio",
} as const;

export type Provider = (typeof PROVIDERS)[keyof typeof PROVIDERS];

export const PROVIDER_VALUES = [
  PROVIDERS.OPENROUTER,
  PROVIDERS.LM_STUDIO,
] as const;

export function isProvider(value: string): value is Provider {
  return PROVIDER_VALUES.includes(value as Provider);
}
