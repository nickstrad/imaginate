/**
 * List available models from every configured provider (OpenAI, Anthropic, Gemini).
 *
 * Run:
 *   npx tsx scripts/models/list-all-models.ts
 *   npx tsx scripts/models/list-all-models.ts gpt-5        # optional prefix filter
 *
 * Any provider whose key is missing/invalid is skipped with a warning; other providers still run.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const filter = process.argv[2] ?? "";
const here = resolve(__dirname);

const scripts = [
  "list-openai-models.ts",
  "list-anthropic-models.ts",
  "list-gemini-models.ts",
];

for (const script of scripts) {
  console.log(`=== ${script} ===`);
  const result = spawnSync(
    "npx",
    ["tsx", resolve(here, script), filter].filter(Boolean),
    { stdio: "inherit" }
  );
  if (result.status !== 0) console.log("(skipped — see error above)");
  console.log();
}
