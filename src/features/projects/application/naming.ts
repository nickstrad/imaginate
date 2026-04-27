import { randomUUID } from "crypto";
import { generateSlug } from "random-word-slugs";

export const PROJECT_NAME_MAX_LEN = 40;

export function sanitizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, PROJECT_NAME_MAX_LEN)
    .replace(/^-+|-+$/g, "");
}

export function uuidSuffix(uuid: string = randomUUID()): string {
  return uuid.slice(0, 5);
}

export function placeholderName(
  slug: string = generateSlug(2, { format: "kebab" }),
  suffix: string = uuidSuffix()
): string {
  return `${slug}-${suffix}`.slice(0, PROJECT_NAME_MAX_LEN);
}

/** Composes a final project name from a raw LLM-suggested base. Returns null if base is unusable. */
export function buildProjectName(
  rawBase: string | null,
  suffix: string = uuidSuffix()
): string | null {
  if (!rawBase) {
    return null;
  }
  const base = sanitizeName(rawBase);
  if (base.length < 2) {
    return null;
  }
  return `${base}-${suffix}`.slice(0, PROJECT_NAME_MAX_LEN);
}
