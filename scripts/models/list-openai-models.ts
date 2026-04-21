/**
 * List available OpenAI models for the configured OPENAI_API_KEY.
 *
 * Run:
 *   npx tsx scripts/models/list-openai-models.ts
 *   npx tsx scripts/models/list-openai-models.ts gpt-5        # optional prefix filter
 */
import { getFilter, listOpenAI, printFiltered, requireEnv } from "./_util";

async function main() {
  requireEnv("OPENAI_API_KEY");
  printFiltered(await listOpenAI(), getFilter());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
