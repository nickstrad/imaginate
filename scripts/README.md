# scripts/

Operational scripts. These exist to answer one question reliably: **what model IDs will the live provider APIs actually accept right now?**

The Vercel AI SDK (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`) passes the `modelId` string you give it straight through to the provider's HTTP API. The SDK does not rewrite or alias IDs. So the SDK "supports a model" iff the provider's API currently accepts that ID. That makes the provider's own `/models` endpoint the only reliable source of truth — static SDK type definitions, blog posts, and memorized knowledge all drift.

All scripts read API keys from `.env` in the repo root.

## Scripts

| Script                              | Purpose                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `list-openai-models.sh [prefix]`    | Print every OpenAI model ID your key can call.                                                                                           |
| `list-anthropic-models.sh [prefix]` | Same for Anthropic.                                                                                                                      |
| `list-gemini-models.sh [prefix]`    | Same for Google Gemini.                                                                                                                  |
| `list-all-models.sh [prefix]`       | Run all three, filtered by optional prefix.                                                                                              |
| `verify-registered-models.sh`       | Cross-check every ID in `src/lib/providers.ts` (`AVAILABLE_MODELS` + `INTERNAL_MODELS`) against the live lists. Exits non-zero on drift. |

## Usage

```bash
chmod +x scripts/*.sh   # first time only

# What can my OpenAI key see?
scripts/list-openai-models.sh

# Just the gpt-5.* family
scripts/list-openai-models.sh gpt-5

# Show Anthropic's current Claude 4 IDs
scripts/list-anthropic-models.sh claude

# Everything, filtered
scripts/list-all-models.sh gemini-3

# Is our registry still accurate?
scripts/verify-registered-models.sh
```

## When to run these

Run `verify-registered-models.sh` **any time you**:

- add a model to `AVAILABLE_MODELS` or `INTERNAL_MODELS` in `src/lib/providers.ts`
- bump `@ai-sdk/*` packages or `ai` itself
- see "model not found" / 404 / 400 provider errors in logs
- add a new provider's API key

## How to read the output

- `OK` — the registered ID is present in the provider's live list. Calls will work.
- `FAIL` — the registered ID is **not** present. The SDK will forward it, the provider will reject it, and calls that route to that model will error out at request time (usually with a retry loop — see `retries: 0` on the agent functions).

## Notes on ID shape

- **OpenAI** accepts bare family IDs (`gpt-5`, `gpt-5.4-mini`). Dated suffixes (`-2026-03-17`) also work and pin a specific snapshot.
- **Anthropic** inconsistently returns both bare (`claude-opus-4-7`, `claude-sonnet-4-6`) and dated (`claude-haiku-4-5-20251001`) forms depending on the model. If a bare ID is _not_ listed for a Claude model, you must use the dated form — the API rejects the bare one. `verify-registered-models.sh` is the way to tell.
- **Gemini** uses `-preview` and `-latest` suffixes liberally. Preview models can be pulled without notice; re-run the list after incidents.
