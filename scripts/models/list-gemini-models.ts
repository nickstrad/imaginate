/**
 * List available Google Gemini models for the configured GEMINI_API_KEY.
 *
 * Run:
 *   npx tsx scripts/models/list-gemini-models.ts
 *   npx tsx scripts/models/list-gemini-models.ts gemini-3      # optional prefix filter
 */
import { getFilter, listGemini, printFiltered, requireEnv } from "./_util";

async function main() {
  requireEnv("GEMINI_API_KEY");
  printFiltered(await listGemini(), getFilter());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
