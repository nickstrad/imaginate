# scripts/models/

These scripts answer one question reliably: **what model IDs will the live provider APIs actually accept right now?**

The Vercel AI SDK (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`) passes the `modelId` string straight through to the provider's HTTP API. The SDK does not rewrite or alias IDs. So the SDK "supports a model" iff the provider's API currently accepts that ID. That makes the provider's own `/models` endpoint the only reliable source of truth — static SDK type definitions, blog posts, and memorized knowledge all drift.

All scripts read API keys from `.env` at the repo root.

## Scripts

| Script                              | Purpose                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `list-openai-models.ts [prefix]`    | Print every OpenAI model ID your key can call.                                                                                           |
| `list-anthropic-models.ts [prefix]` | Same for Anthropic.                                                                                                                      |
| `list-gemini-models.ts [prefix]`    | Same for Google Gemini.                                                                                                                  |
| `list-all-models.ts [prefix]`       | Run all three, filtered by optional prefix.                                                                                              |
| `verify-registered-models.ts`       | Cross-check every ID in `src/lib/providers.ts` (`AVAILABLE_MODELS` + `INTERNAL_MODELS`) against the live lists. Exits non-zero on drift. |

## Usage

```bash
npx tsx scripts/models/list-openai-models.ts
npx tsx scripts/models/list-openai-models.ts gpt-5
npx tsx scripts/models/list-anthropic-models.ts claude
npx tsx scripts/models/list-all-models.ts gemini-3
npx tsx scripts/models/verify-registered-models.ts
```

## When to run these

Run `verify-registered-models.sh` any time you:

- add a model to `AVAILABLE_MODELS` or `INTERNAL_MODELS` in `src/lib/providers.ts`
- bump `@ai-sdk/*` packages or `ai` itself
- see "model not found" / 404 / 400 provider errors in logs
- add a new provider's API key

## How to read the output

- `OK` — the registered ID is present in the provider's live list. Calls will work.
- `FAIL` — the registered ID is **not** present. The SDK will forward it, the provider will reject it, and calls that route to that model will error out at request time.

## Notes on ID shape

- **OpenAI** accepts bare family IDs (`gpt-5`, `gpt-5-mini`). Dated suffixes (`-2026-03-17`) also work and pin a specific snapshot.
- **Anthropic** inconsistently returns both bare (`claude-opus-4-7`, `claude-sonnet-4-6`) and dated (`claude-haiku-4-5-20251001`) forms depending on the model. If a bare ID is _not_ listed for a Claude model, you must use the dated form — the API rejects the bare one. `verify-registered-models.sh` is the way to tell.
- **Gemini** uses `-preview` and `-latest` suffixes liberally. Preview models can be pulled without notice; re-run the list after incidents.
