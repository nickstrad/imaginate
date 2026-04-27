# Model config — refresh procedure

This file lives next to `src/shared/config/models.ts`, the canonical map of `MODEL_KEYS` → OpenRouter slugs. Read this **before** editing `models.ts` or `src/platform/models/constants.ts` (`MODEL_ROUTES`). It tells you how to systematically pick OpenRouter models for the agent's planner and three executor rungs, and how to refresh those picks as the OpenRouter catalog evolves.

If you only need to **add** an OpenRouter slug for some other reason (a one-off script, a new feature), skip this file and just append to `MODEL_IDS`. This guide is specifically about the planner / executor fallback registry consumed by the agent runtime.

## Where the selection lives

Two files participate. Always edit them together — adding a slug without using it is dead weight; using a slug you didn't add fails type-checking.

1. **`src/shared/config/models.ts`** — `MODEL_IDS`, the keyed map of every OpenRouter slug the codebase knows about. New fallbacks must be registered here first.
2. **`src/platform/models/constants.ts`** — `MODEL_ROUTES`, the per-layer registry of `{ primary, fallbacks }`. This is where capability/diversity decisions are encoded.

The plan that motivated the current shape is `docs/plans/open/openrouter-model-route-fallbacks.md`. Read it once for context; come back here for ongoing refresh work.

## What an agent should do when refreshing

Run these steps in order. The output is a PR that updates `MODEL_IDS`, `MODEL_ROUTES`, and the per-layer table in the plan file (or this file if the plan has been retired).

### 1. Survey OpenRouter

Use these pages as the authoritative source. Prices and rankings change weekly; never rely on memory.

- **Programming leaderboard** — https://openrouter.ai/rankings/programming. Treat the **top 10** as the universe of credible coder models for layers 3 and 4. The current #1 belongs in the layer 4 fallback list unless it's already a primary somewhere.
- **Top weekly trending** — https://openrouter.ai/models?fmt=cards&order=top-weekly. Catches new releases that haven't accrued enough volume to climb the leaderboard yet but are gaining traction.
- **Per-model pages** — `https://openrouter.ai/<vendor>/<slug>`. The only place to read live `$/Mtok input`, `$/Mtok output`, context window, release date, and any moderation/sunset notes. Visit one per candidate.
- **Provider routing & moderation docs** — https://openrouter.ai/docs/features/provider-routing and https://openrouter.ai/docs/api-reference/parameters#moderation. Use these to confirm that the `models` fallback parameter still triggers on the failure modes we care about (rate limit, downtime, moderation, context-length validation).

For each candidate, capture: exact slug, input $/Mtok, output $/Mtok, context window, provider family (Anthropic, OpenAI, Google, xAI, DeepSeek, Qwen, Moonshot, Mistral, etc.), and a one-sentence positioning quote from the model page.

### 2. Apply the selection rules

These rules are absolute. If a candidate violates one, drop it.

1. **Cross-provider diversity wins.** Each layer's fallback list should span at least two provider families besides the primary. The whole point of OpenRouter fallbacks is to survive a single-provider outage; same-family fallback only when no comparable cross-family option exists.
2. **Same role, same purpose.** A planner fallback must still be cheap, fast, and good at structured output / tool calls. A strong-coder fallback must still be a strong coder. Don't paper over a capability gap with a wildly different model.
3. **No primary collisions.** A model that is the **primary** of any layer must not appear as a **fallback** in any layer — OpenRouter would just retry the same endpoint we'd hit when the app advances the ladder.
4. **Order = preference.** Cheapest-good-enough first, then increasingly expensive backstops. OpenRouter walks the list left-to-right, so a wildly expensive option behind a strict rate limit should be last.
5. **2–3 fallbacks per layer.** One fallback is a single point of failure of its own. More than three is configuration noise that nobody validates.

### 3. Layer-specific intent

Carry these into the trade-off when ranking candidates within a layer.

- **Planner** — short, cheap reasoning; structured output and tool-call planning. Latency and $/Mtok dominate; ceiling capability does not.
- **Executor default** — the workhorse coder run on most tasks. Long context and fast tool-calling at meaningfully cheaper prices than the strong tiers.
- **Executor fallback 1** — stronger coder when the default rung's output is insufficient. Quality matters more than price; cross-provider diversity from the default rung is the durability lever.
- **Executor fallback 2** — strongest / last-resort coder. Top of `openrouter.ai/rankings/programming`. Quality dominates; price is the lowest concern.

### 4. Touch these files in one PR

```
src/shared/config/models.ts          # add new slugs to MODEL_IDS
src/platform/models/constants.ts     # update MODEL_ROUTES.<layer>.fallbacks
src/platform/models/factory.test.ts  # extend if you added a new invariant
docs/plans/open/openrouter-model-route-fallbacks.md  # if still in open/
```

If the plan has been retired and folded into archive/, refresh the per-layer table inside this file instead — keep the freshness loop in one place.

### 5. Verify

```bash
npm test          # MODEL_ROUTES tests assert MODEL_IDS coverage and no-primary-as-fallback
npx tsc --noEmit  # catches MODEL_KEYS typos
npx eslint src
npx next build
```

Existing tests in `src/platform/models/factory.test.ts` enforce: every fallback resolves to a real `MODEL_IDS` entry, no primary appears as a fallback, every layer has at least one fallback. Update them if you change the shape.

## When to refresh

Refresh the per-layer table when **any** of these signals fire:

- A primary or any listed fallback is **deprecated/sunset** by its provider (OpenRouter posts these on the model page; they also appear in the response body when triggered).
- A new model lands in the **top 5** of `openrouter.ai/rankings/programming` and the layer 4 fallback list does not include it.
- Provider pricing shifts **≥30%** on any listed model — re-check the cheapest-first ordering inside the layer.
- A new model **family** (a vendor we don't yet route to) ships a coding SKU that materially outperforms an existing fallback at comparable price. Cross-family diversity is the durability lever; new families are worth promoting in.
- An incident report shows a fallback list was **fully exhausted in production** without recovery. Re-evaluate that layer's diversity.

Otherwise, run a refresh on a **quarterly cadence**. The leaderboard moves without us noticing; quarterly is the cheapest defensible cadence.

## Anti-patterns

- **Don't auto-pick from live rankings.** The freshness rules above are deliberately manual. We control which models can run on production traffic; an automated picker would route requests to a model we've never validated.
- **Don't add a fallback that's also a primary.** The lint of `factory.test.ts` will catch this, but think about it before staging the change rather than fighting the test.
- **Don't reach for `openrouter/auto`.** It's tempting and wrong here. Auto-routing surrenders our per-layer capability contract; the planner could end up running on a Sonnet-class model and cost 100× expected.
- **Don't drop the env-driven primaries.** Operators rely on `MODEL_PLANNER` / `MODEL_EXECUTOR_*` to pin a different primary in staging vs. prod without redeploying. Fallbacks are code-only on purpose; primaries are env-overridable on purpose.
