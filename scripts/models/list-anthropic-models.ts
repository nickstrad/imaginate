/**
 * List available Anthropic models for the configured ANTHROPIC_API_KEY.
 *
 * Run:
 *   npx tsx scripts/models/list-anthropic-models.ts
 *   npx tsx scripts/models/list-anthropic-models.ts claude-sonnet    # optional prefix filter
 */
import { getFilter, listAnthropic, printFiltered, requireEnv } from "./_util";

async function main() {
  requireEnv("ANTHROPIC_API_KEY");
  printFiltered(await listAnthropic(), getFilter());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
