/**
 * Cross-check every model ID registered in src/lib/providers.ts against the
 * live model list from each provider's API. Exits non-zero if any registered
 * ID isn't present in its provider's listing.
 *
 * Run:
 *   npx tsx scripts/models/verify-registered-models.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { listAnthropic, listGemini, listOpenAI } from "./_util";

type Provider = "openai" | "anthropic" | "gemini";
type Registered = { provider: Provider; value: string; block: string };

function extractRegistered(): Registered[] {
  const src = readFileSync(resolve("src/lib/providers.ts"), "utf8");
  const out: Registered[] = [];
  for (const block of ["AVAILABLE_MODELS", "INTERNAL_MODELS"]) {
    const m = src.match(
      new RegExp(`export const ${block} = \\{([\\s\\S]+?)\\n\\} as const`)
    );
    if (!m) continue;
    const body = m[1];
    const provRe = /(openai|anthropic|gemini):\s*\[([\s\S]*?)\]/g;
    let pm: RegExpExecArray | null;
    while ((pm = provRe.exec(body))) {
      const provider = pm[1] as Provider;
      const valRe = /value:\s*"([^"]+)"/g;
      let vm: RegExpExecArray | null;
      while ((vm = valRe.exec(pm[2]))) {
        out.push({ provider, value: vm[1], block });
      }
    }
  }
  return out;
}

async function main() {
  const registered = extractRegistered();
  if (registered.length === 0) {
    console.error("No models extracted from src/lib/providers.ts");
    process.exit(2);
  }

  console.log("--- Fetching live model lists ---");
  const [openai, anthropic, gemini] = await Promise.all([
    listOpenAI().catch((e) => {
      console.warn(`openai list failed: ${e}`);
      return [] as string[];
    }),
    listAnthropic().catch((e) => {
      console.warn(`anthropic list failed: ${e}`);
      return [] as string[];
    }),
    listGemini().catch((e) => {
      console.warn(`gemini list failed: ${e}`);
      return [] as string[];
    }),
  ]);

  const live: Record<Provider, Set<string>> = {
    openai: new Set(openai),
    anthropic: new Set(anthropic),
    gemini: new Set(gemini),
  };

  console.log("--- Verifying registered model IDs ---");
  let failures = 0;
  for (const r of registered) {
    const prov = r.provider.padEnd(10);
    const val = r.value.padEnd(45);
    if (live[r.provider].has(r.value)) {
      console.log(`  OK   ${prov} ${val} (${r.block})`);
    } else {
      console.log(`  FAIL ${prov} ${val} (${r.block}) — not in live list`);
      failures++;
    }
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
