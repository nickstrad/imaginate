/**
 * Shared helpers for model listing scripts.
 * Loads `.env` at repo root so API keys are available to each script.
 */
import "dotenv/config";

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Error: ${name} is not set (check .env at repo root).`);
    process.exit(1);
  }
  return v;
}

export function getFilter(): string {
  return process.argv[2] ?? "";
}

export function printFiltered(ids: string[], filter: string) {
  for (const id of [...ids].sort()) {
    if (!filter || id.startsWith(filter)) console.log(id);
  }
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `HTTP ${res.status} ${res.statusText}: ${body.slice(0, 500)}`
    );
  }
  return (await res.json()) as T;
}

export async function listOpenAI(): Promise<string[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return [];
  const { data } = await fetchJson<{ data: Array<{ id: string }> }>(
    "https://api.openai.com/v1/models",
    { headers: { Authorization: `Bearer ${key}` } }
  );
  return data.map((m) => m.id);
}

export async function listAnthropic(): Promise<string[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return [];
  const { data } = await fetchJson<{ data: Array<{ id: string }> }>(
    "https://api.anthropic.com/v1/models",
    { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } }
  );
  return data.map((m) => m.id);
}

export async function listGemini(): Promise<string[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return [];
  const { models } = await fetchJson<{ models: Array<{ name: string }> }>(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
  );
  return models.map((m) => m.name.replace(/^models\//, ""));
}
