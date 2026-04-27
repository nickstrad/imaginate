export const SEPARATOR = {
  section: "\n\n",
  cacheBoundary: "\n\n---\n\n",
} as const;

export function buildSystemPrompt(args: {
  base: string[];
  dynamic?: string[];
}): string {
  const staticPart = args.base.map((s) => s.trim()).join(SEPARATOR.section);
  const dyn = (args.dynamic ?? []).map((s) => s.trim()).join(SEPARATOR.section);
  if (!dyn) {
    return staticPart;
  }
  return `${staticPart}${SEPARATOR.cacheBoundary}${dyn}`;
}

export const CACHE_PROVIDER_OPTIONS = {
  openrouter: { cacheControl: { type: "ephemeral" as const } },
  anthropic: { cacheControl: { type: "ephemeral" as const } },
};
