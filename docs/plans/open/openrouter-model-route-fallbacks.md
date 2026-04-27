# OpenRouter Model Route Fallbacks

## Goal

Use OpenRouter's request-time `models` fallback parameter inside each logical model role, so transient provider errors (rate limits, downtime, moderation, context-length validation) are recovered _within the same capability rung_ before our app-level executor ladder escalates. Pair the routing change with a curated, cross-provider fallback list per layer (planner / executorDefault / executorFallback1 / executorFallback2) chosen for capability + price + provider diversity, so a single provider outage never takes the agent down.

Reference: [OpenRouter Model Fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks).

## The problem

The current model registry has one planner model and three executor models:

```ts
MODEL_REGISTRY = {
  planner,
  executorDefault,
  executorFallback1,
  executorFallback2,
};

EXECUTOR_LADDER = [executorDefault, executorFallback1, executorFallback2];
```

`runPlanner` resolves one planner model. `runCodingAgentWithEscalation` walks `EXECUTOR_LADDER`, and `runExecutorOnce` calls that rung's model. If a provider error is retryable, the runner currently moves to the next app-level executor model.

That mixes two different concerns:

- **Availability fallback:** the same logical level could not answer because a provider is down, rate-limited, or filtered.
- **Capability escalation:** the current level answered but the result was insufficient, so the app should try a stronger or different rung.

OpenRouter's `models` request parameter tries model IDs in priority order and triggers fallback on context-length validation, moderation flags, rate limiting, and downtime. The response body reports which model was ultimately used. That is a better fit for availability fallback than burning capability rungs.

A second, related problem: today every primary is single-provider. If OpenAI throttles `gpt-5-codex` for an hour, executorFallback1 has nothing to fall back to and we silently degrade by jumping to a different capability tier. Per-layer fallbacks become real durability only if the list is **cross-provider**.

## What "after" looks like

### Route shape

Keep the app-level ladder shape:

```txt
planner route
executor rung 1 (default)
executor rung 2 (fallback1)
executor rung 3 (fallback2)
```

But make each route a primary plus an ordered OpenRouter fallback list:

```ts
type ModelRoute = {
  role: "planner" | "executor";
  level: "planner" | "default" | "fallback1" | "fallback2";
  primary: ModelSpec;
  fallbacks: ModelSpec[];
};
```

Configuration shape:

```ts
MODEL_ROUTES = {
  planner: {
    primary: MODEL_REGISTRY.planner,
    fallbacks: [
      MODEL_REGISTRY.plannerFallback1,
      MODEL_REGISTRY.plannerFallback2,
    ],
  },
  executorDefault: {
    primary: MODEL_REGISTRY.executorDefault,
    fallbacks: [
      MODEL_REGISTRY.executorDefaultFallback1,
      MODEL_REGISTRY.executorDefaultFallback2,
    ],
  },
  executorFallback1: {
    primary: MODEL_REGISTRY.executorFallback1,
    fallbacks: [
      MODEL_REGISTRY.executorFallback1Backup1,
      MODEL_REGISTRY.executorFallback1Backup2,
    ],
  },
  executorFallback2: {
    primary: MODEL_REGISTRY.executorFallback2,
    fallbacks: [
      MODEL_REGISTRY.executorFallback2Backup1,
      MODEL_REGISTRY.executorFallback2Backup2,
    ],
  },
};
```

The app ladder still moves between logical executor levels; OpenRouter handles same-level alternatives transparently:

```txt
executorDefault primary -> executorDefault fallback A -> executorDefault fallback B
                       (OpenRouter handles availability fallback)

executorDefault route -> executorFallback1 route -> executorFallback2 route
                       (app handles capability escalation)
```

At the call site, the AI SDK call carries both the primary and the OpenRouter fallback list:

```ts
await generateText({
  model: createModelProvider(route.primary),
  providerOptions: {
    ...CACHE_PROVIDER_OPTIONS,
    openrouter: {
      models: route.fallbacks.map((spec) => MODEL_IDS[spec.model]),
    },
  },
});
```

Before implementing that exact shape, verify the current `@openrouter/ai-sdk-provider` option name for passing OpenRouter's `models` parameter. If the SDK does not expose it cleanly, add a narrow OpenRouter chat adapter for agent calls rather than weakening the route concept.

### Fallback selection — April 2026

The choices below were validated against live `openrouter.ai` model pages on **2026-04-26**. Prices are USD per million tokens, input / output. Slugs must match `MODEL_IDS` in `src/shared/config/models.ts` — adding a new fallback means adding its ID there in the same PR. **Selection rules** that agents should re-apply when refreshing:

1. **Cross-provider diversity wins.** Each fallback list should span at least two provider families besides the primary. Same-family fallback only when no comparable cross-family option exists at that price/capability.
2. **Same role.** A planner fallback must still be cheap, fast, and good at structured output / planning. A strong-coder fallback must still be a strong coder. Don't paper over a capability gap with a wildly different model.
3. **Avoid registry collisions.** A model that is the **primary** of another layer should not appear as a **fallback** in any layer — OpenRouter would just retry the same endpoint we'd hit anyway when the app escalates.
4. **Order within a list = preference.** Cheapest-good-enough first, then increasingly expensive backstops. OpenRouter walks the list left-to-right.

#### Layer 1 — Planner

**Role:** short, cheap reasoning; structured output and tool-call planning. Latency and $/Mtok matter more than ceiling capability.

| Slot       | OpenRouter slug                       | $/Mtok in / out | Context | Family   | Why                                                                                  |
| ---------- | ------------------------------------- | --------------- | ------- | -------- | ------------------------------------------------------------------------------------ |
| primary    | `google/gemini-3.1-flash-lite-preview` | 0.25 / 1.50    | 1M      | Google   | Existing primary; cheap planner with thinking levels.                                |
| fallback 1 | `openai/gpt-5-mini`                   | 0.25 / 2.00    | 400K    | OpenAI   | Cross-family, similar input price, strong instruction following.                     |
| fallback 2 | `x-ai/grok-4.1-fast`                  | 0.20 / 0.50    | 2M      | xAI      | Cheaper output than primary, "best agentic tool calling" positioning, third family. |

#### Layer 2 — Executor default

**Role:** the workhorse coder that runs most tasks; long context and fast tool-calling at meaningfully cheaper prices than the strong tiers.

| Slot       | OpenRouter slug                  | $/Mtok in / out  | Context | Family   | Why                                                                                                                |
| ---------- | -------------------------------- | ---------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| primary    | `google/gemini-3-flash-preview` | 0.50 / 3.00      | 1M      | Google   | Existing primary; agentic + coding positioning at flash pricing.                                                   |
| fallback 1 | `qwen/qwen3-coder`              | 0.22 / 1.80      | 262K    | Alibaba  | Coding-optimized for agentic function calling and long-context repo reasoning, very different family from Google. |
| fallback 2 | `deepseek/deepseek-v3.2`        | 0.25 / 0.38      | 131K    | DeepSeek | Cheapest credible coder; ranks #3 on programming leaderboard; output price ~8× cheaper than primary.               |

#### Layer 3 — Executor fallback 1

**Role:** stronger coder when the default rung's output is insufficient. Quality matters more than price; cross-provider diversity from layer 2 is the durability lever.

| Slot       | OpenRouter slug              | $/Mtok in / out | Context | Family    | Why                                                                                                                  |
| ---------- | ---------------------------- | --------------- | ------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| primary    | `openai/gpt-5-codex`         | 1.25 / 10.00    | 400K    | OpenAI    | Existing primary; coding-specialized GPT-5 variant.                                                                  |
| fallback 1 | `anthropic/claude-haiku-4.5` | 1.00 / 5.00     | 200K    | Anthropic | Near-frontier coding at Haiku price; cross-family backstop; cheaper than primary on output.                          |
| fallback 2 | `x-ai/grok-code-fast-1`      | 0.20 / 1.50     | 256K    | xAI       | Coding-specialized agentic model with reasoning traces; very cheap; third family for diversity vs primary + first fallback. |

#### Layer 4 — Executor fallback 2

**Role:** strongest / last-resort coder. Top of the OpenRouter programming leaderboard. Quality dominates; price is the lowest concern.

| Slot       | OpenRouter slug              | $/Mtok in / out | Context | Family    | Why                                                                                                                                            |
| ---------- | ---------------------------- | --------------- | ------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| primary    | `anthropic/claude-sonnet-4.6` | 3.00 / 15.00   | 1M      | Anthropic | Existing primary; "frontier performance across coding, agents, and professional work."                                                          |
| fallback 1 | `moonshotai/kimi-k2.6`       | 0.74 / 4.66     | 256K    | Moonshot  | **#1 on the programming rankings as of 2026-04-26**, released 2026-04-20; meaningfully cheaper than primary while ranked above it on coding.    |
| fallback 2 | `anthropic/claude-opus-4.7`  | 5.00 / 25.00    | 1M      | Anthropic | "Built for long-running asynchronous agents," released 2026-04-16; same-family backstop accepted here because no non-Anthropic Opus-class peer at this layer that isn't already a primary elsewhere. |

### `MODEL_IDS` additions

`src/shared/config/models.ts` currently lists 7 entries. Implementation must register every new fallback as a `MODEL_KEYS` value with a descriptive constant name. Example additions:

```ts
export const MODEL_IDS = {
  // …existing…
  GPT_5_MINI: "openai/gpt-5-mini",
  GROK_4_1_FAST: "x-ai/grok-4.1-fast",
  QWEN_3_CODER: "qwen/qwen3-coder",
  DEEPSEEK_V3_2: "deepseek/deepseek-v3.2",
  CLAUDE_HAIKU_4_5: "anthropic/claude-haiku-4.5",
  GROK_CODE_FAST_1: "x-ai/grok-code-fast-1",
  KIMI_K2_6: "moonshotai/kimi-k2.6",
  CLAUDE_OPUS_4_7: "anthropic/claude-opus-4.7",
} as const;
```

(`KIMI_K2_6` already exists pointing at the older `kimi-k2.6` slug — confirm at implementation time whether OpenRouter's canonical slug is dated; rename or keep as-is accordingly.)

## Sequencing

Single-PR refactor. Fallback model IDs are defined in code, not environment variables — the registry is curated and reviewed alongside other architectural decisions, not adjusted per-deploy. Primary models remain env-overridable as today (`MODEL_PLANNER`, `MODEL_EXECUTOR_*`).

Order:

1. **Add new model IDs** to `src/shared/config/models.ts` so `MODEL_KEYS` accepts the fallbacks.
2. **Add `MODEL_ROUTES`** in `src/platform/models/constants.ts` as a code constant: `{ planner, executorDefault, executorFallback1, executorFallback2 }`, each `{ primary, fallbacks }`. The primary fields wrap the existing `MODEL_REGISTRY` entries (env-driven). The fallback arrays are hard-coded `ModelSpec`s built from `MODEL_KEYS`.
3. **Add a route-lookup helper** `resolveRouteFallbacks(primary: ModelSpec): ModelSpec[]` in `src/platform/models/factory.ts`. The agent's model gateway uses this to find the correct fallback list for any primary spec it's asked to call.
4. **Inject fallbacks at the gateway** in `src/agent/adapters/ai-sdk/model-gateway.ts`: before calling `generateText`, look up the configured fallbacks for the resolved primary and merge their OpenRouter slugs into `providerOptions.openrouter.models` (preserving any caller-supplied options). The application layer (`plan-run.ts`, `execute-run.ts`) does not change — the route is invisible to it.
5. **Verify `@openrouter/ai-sdk-provider`** forwards `models` through `providerOptions.openrouter`. If not, add a narrow OpenRouter chat adapter under `src/agent/adapters/ai-sdk/` rather than weakening the route concept.
6. **Runner escalation semantics** — no code change needed. With per-call fallbacks injected at the gateway, by the time `executeRun` throws, OpenRouter has already exhausted the in-route fallback list, so the ladder advance now means "entire route failed" rather than "primary failed." Document this shift in a code comment near `runAgent`'s ladder loop.
7. **Tests** — colocated `*.test.ts`:
   - `resolveRouteFallbacks`: returns the configured list for each layer's primary; returns `[]` for an unknown primary.
   - Route registry: every `ModelSpec` in any fallback list resolves to a real `MODEL_IDS` entry.
   - Gateway request options: a fake `generateText` captures the call args; assert `providerOptions.openrouter.models` equals the layer's configured fallback slugs in order.
   - Gateway preserves caller-supplied `providerOptions.openrouter.*` (e.g. cache options) without dropping them.
   - Runner behavior unchanged: existing executor-ladder tests still pass; ladder advances on error, holds on success.

## Definition of done / Verification

- Each route emits a request that includes its configured OpenRouter fallback model list via `providerOptions.openrouter.models`.
- Provider rate-limit / downtime / moderation errors are recovered _within_ the route when fallbacks remain (verified by the OpenRouter response surfacing a fallback model in the response; until telemetry lands, this is observed at runtime, not asserted in tests).
- App-level executor escalation is reserved for capability escalation or fully-exhausted route failure.
- New model IDs are registered in `MODEL_IDS` and `MODEL_ROUTES` references resolve.
- Tests cover route lookup, fallback list construction, gateway request-option merging, and preservation of caller-supplied provider options.
- `npm test`, `npx tsc --noEmit`, `npx eslint src`, and `npx next build` all pass.
- Telemetry/runtime events expose the route attempted and the fallback list available — exact used-model capture is delegated to `agent-telemetry-refactor`.

## Selection freshness

Re-validate the per-layer fallback table when **any** of these signals fire:

- A primary or fallback model is deprecated/sunset by its provider (OpenRouter posts these on the model page).
- A new model lands in the **top 5** of `openrouter.ai/rankings/programming` and the layer 4 list does not include it.
- Provider pricing shifts ≥30% on any listed model (re-check the cheapest-first ordering inside a layer).
- A new model family (a vendor we don't yet route to) launches a coding SKU that materially outperforms an existing fallback at comparable price.

Otherwise, refresh on a quarterly cadence — this list will rot, and quarterly is the cheapest defensible cadence for "the leaderboard moved without us noticing."

## Out of scope

- Replacing the planner/executor architecture.
- Switching to OpenRouter's `openrouter/auto` router.
- Automatically choosing fallback models from live OpenRouter rankings (the freshness rules above are manual on purpose so we control which models can run on production traffic).
- Redesigning prompts, tools, sandbox behavior, or the final-output acceptance heuristic.
- Per-call dynamic re-ordering of fallback lists based on recent error rates — telemetry must land first; see `agent-telemetry-refactor`.

## Conflicts checked

Reviewed `docs/plans/open/` and `docs/plans/drift/` on 2026-04-26:

- `open/agent-telemetry-refactor/` — overlaps on which model/route was attempted and used. **Boundary:** this plan owns request-time fallback wiring and runner escalation semantics; the telemetry plan owns the durable schema for which route/model was attempted, ultimately used, and at what cost. This plan emits enough runtime context for telemetry to record; it does not define telemetry storage.
- `open/sandbox-auto-revive.md` — no overlap (sandbox lifecycle, not model routing).
- `open/enforce-dumb-presentation-views.md` — no overlap (presentation lint, not agent runtime).
- `docs/plans/drift/` — only the auto-generated `README.md`; no drift plans touch model routing.

No contradicting plans.
