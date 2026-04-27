# OpenRouter Model Route Fallbacks

## Goal

Use OpenRouter model fallbacks inside each logical model role while preserving the current app-level premise: one planner route and a small executor capability ladder. The planner and each executor rung should keep a target model type, but each target can list same-purpose backup models so OpenRouter handles transient provider errors, rate limits, downtime, and moderation refusals before our app escalates to a stronger coding rung.

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

- **Availability fallback:** the same logical model level could not answer because a provider is down, rate-limited, or filtered.
- **Capability escalation:** the current coding level answered but the result was insufficient, so the app should try a stronger or different executor rung.

OpenRouter supports a `models` request parameter that tries model IDs in priority order. Its fallback behavior can trigger on errors including context length validation, moderation flags, rate limiting, and downtime, and the response body reports which model was ultimately used. That is a better fit for availability fallback than advancing our app-level ladder.

## What "after" looks like

Keep the app-level shape:

```txt
planner route
executor rung 1
executor rung 2
executor rung 3
```

But make each route a primary model plus ordered OpenRouter fallback models:

```ts
type ModelRoute = {
  role: "planner" | "executor";
  level: "planner" | "default" | "fallback1" | "fallback2";
  primary: ModelSpec;
  fallbacks: ModelSpec[];
};
```

Example configuration shape:

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
    fallbacks: [MODEL_REGISTRY.executorFallback1Backup],
  },
  executorFallback2: {
    primary: MODEL_REGISTRY.executorFallback2,
    fallbacks: [MODEL_REGISTRY.executorFallback2Backup],
  },
};
```

The app ladder still moves between logical executor levels:

```txt
executorDefault route -> executorFallback1 route -> executorFallback2 route
```

Within a route, OpenRouter tries same-level alternatives:

```txt
executorDefault primary -> executorDefault fallback A -> executorDefault fallback B
```

At the call site, model creation should carry both the primary model and OpenRouter fallback model IDs:

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

Before implementing that exact shape, verify the current `@openrouter/ai-sdk-provider` option name for passing OpenRouter's `models` parameter. If the AI SDK provider does not expose it cleanly, add a narrow OpenRouter chat adapter for agent model calls rather than weakening the route concept.

## Sequencing

1. Add model route types in the agent model gateway (`src/agent/adapters/ai-sdk/model-gateway.ts`) and shared model config (`src/platform/models`).
2. Extend model configuration so each logical role/rung can declare ordered fallback model IDs. Prefer environment variables that are easy to leave empty, such as comma-separated `MODEL_PLANNER_FALLBACKS`, `MODEL_EXECUTOR_DEFAULT_FALLBACKS`, `MODEL_EXECUTOR_FALLBACK_1_FALLBACKS`, and `MODEL_EXECUTOR_FALLBACK_2_FALLBACKS`.
3. Resolve routes into `{ primary, fallbackModels }` while validating that every configured model exists in `MODEL_IDS`.
4. Thread the planner route into `runPlanner` and each executor route into `runExecutorOnce`.
5. Pass OpenRouter's fallback `models` parameter on model requests, preserving existing prompt, tool, cache, token, and stop behavior.
6. Update runner escalation semantics so provider availability failures do not immediately become capability escalation. If a route fully fails after OpenRouter exhausts its model fallbacks, record it as route failure; only advance the app ladder when the failure category means the current capability level cannot proceed or when `shouldEscalate` requests a stronger executor.
7. Capture the actual model used when OpenRouter exposes it through the response metadata. If the AI SDK path does not expose it, record the route primary plus fallback list and leave exact-used-model capture to the telemetry plan.
8. Add tests for route parsing, fallback ordering, empty fallback config, invalid model IDs, planner fallback request options, executor fallback request options, and runner behavior that distinguishes route failure from capability escalation.

## Definition of done / Verification

- Planner calls can include OpenRouter fallback models without changing the planner's role or output contract.
- Each executor ladder rung can include OpenRouter fallback models without changing the app-level rung order.
- Retryable rate-limit/downtime/moderation-style provider errors are handled within the current route when OpenRouter has fallback models available.
- App-level executor escalation remains reserved for quality/capability escalation or complete route failure after OpenRouter fallbacks are exhausted.
- Tests cover route config parsing, model validation, request option construction, and runner escalation behavior.
- Telemetry or runtime events expose enough route information to answer which logical route was attempted and which fallback list was available.

## Out of scope

- Replacing the planner/executor architecture.
- Switching to OpenRouter's `openrouter/auto` router.
- Automatically choosing fallback models from live OpenRouter rankings.
- Redesigning prompts, tools, sandbox behavior, or the final-output acceptance heuristic.

## Conflicts checked

Checked `docs/plans/open/` and `docs/plans/drift/`. Overlaps with `agent-telemetry-refactor` on model/route observability; this plan owns routing behavior (request-time fallback + escalation semantics), while telemetry owns durable analysis schema for which route/model was attempted and used. No overlap with `sandbox-auto-revive`. `drift/` is empty.
