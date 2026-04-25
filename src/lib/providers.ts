export const PROVIDERS = ["openrouter"] as const;
export type Provider = (typeof PROVIDERS)[number];
