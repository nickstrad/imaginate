import type { JsonValue, LogMetadata } from "./schema";

const REDACTED = "[REDACTED]";

const SECRET_SUBSTRINGS = [
  "apikey",
  "api_key",
  "api-key",
  "secret",
  "token",
  "password",
  "passwd",
  "authorization",
  "bearer",
  "credential",
  "privatekey",
  "private_key",
  "private-key",
];

function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SECRET_SUBSTRINGS.some((s) => lower.includes(s));
}

export function normalizeValue(v: unknown): JsonValue {
  if (v === null || v === undefined) return null;
  if (v instanceof Error) {
    return { name: v.name, message: v.message, stack: v.stack ?? null };
  }
  const t = typeof v;
  if (t === "string") {
    return v as string;
  }
  if (t === "number") {
    return Number.isFinite(v as number) ? (v as number) : null;
  }
  if (t === "boolean") return v as boolean;
  if (Array.isArray(v)) return v.map(normalizeValue);
  if (t === "object") {
    const out: Record<string, JsonValue> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = isSecretKey(k) ? REDACTED : normalizeValue(val);
    }
    return out;
  }
  return String(v);
}

export function normalizeMetadata(
  metadata: Record<string, unknown> | undefined
): LogMetadata | undefined {
  if (!metadata) return undefined;
  const out: Record<string, JsonValue> = {};
  for (const [k, v] of Object.entries(metadata)) {
    out[k] = isSecretKey(k) ? REDACTED : normalizeValue(v);
  }
  return out;
}
