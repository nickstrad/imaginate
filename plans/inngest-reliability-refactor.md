# Inngest reliability refactor

## The problem

Our Inngest agent functions (`codeAgent`, `askAgent`, and any future planner/multi-agent code) currently behave badly under failure:

1. **LLM calls live outside `step.run`.** The big `generateText` call in `codeAgentFunction` is awaited at the top level of the Inngest handler, not inside a `step.run` wrapper. That means:
   - Inngest has no durable checkpoint for the LLM result.
   - If the handler throws anywhere downstream, the entire LLM generation re-runs on the next Inngest invocation — burning quota and wall time.
   - Every retry creates a fresh sandbox via `get-sandbox-id`, leaking E2B sandboxes.

2. **`onStepFinish` performs DB writes outside step boundaries.** Each LLM step persists thoughts via `prisma.message.update` directly inside the AI SDK's `onStepFinish` callback. These writes are not idempotent and are not memoized — on handler retry they re-fire, potentially clobbering state.

3. **Retries are blunt.** We worked around the loop by setting `retries: 0` on `codeAgent` / `askAgent`. That stops the bleed but means _any_ transient blip (brief network failure, provider 500) kills the run with no recovery. The fix should be the opposite: make retries _safe_ so we can actually use them.

4. **Event data is re-parsed per function.** Each function re-derives `{ userPrompt, projectId, selectedModels }` from `event.data`. A shared Inngest-typed event schema (`EventSchemas.fromZod`) would make `event.data` typed once at the client level and remove the per-function `parseAgentRunEvent` boilerplate.

5. **No observability into mid-run LLM cost.** `generateText` returns a `usage` object we mostly ignore. We log `textChars` per step but not tokens/cost, so quota-burn incidents are only visible after the fact via the provider dashboard.

## What a correct version looks like

### 1. Wrap the LLM call in a `step.run`

Every expensive, non-idempotent external call should be a checkpointed step. The `generateText` call in `codeAgent` should be:

```ts
const llmResult = await step.run("agent-generation", async () => {
  return await generateText({
    /* … */
  });
});
```

So that:

- On retry, Inngest returns the memoized `llmResult` and does NOT re-call the provider.
- Transient errors during generation bubble up as a failed step; the function can optionally retry _just that step_ if we want.

The tricky part: tool-execute callbacks (`terminal`, `createOrUpdateFiles`, `readFiles`) currently use `step.run` internally. Nesting `step.run` inside `step.run` isn't supported. Two options:

- **A. Pre-spawn tool steps outside generateText.** Refactor tools so they route to an out-of-band queue and the agent loop polls. Complex.
- **B. Drop tool-level `step.run` wrapping and rely on the outer agent step.** Simpler. Tools become plain async functions; if the whole agent step fails, it retries once and rebuilds state from scratch. Loses fine-grained checkpointing per tool but gains correct overall retry semantics.

Recommendation: **start with (B)**. It's the smaller change and matches how most Inngest users run LLM loops.

### 2. Move `onStepFinish` side effects into proper steps

The prisma `thoughts` update shouldn't run inline in the SDK callback. Either:

- Collect thoughts in memory during generation, then persist them in a single `step.run("save-thoughts")` after the LLM step completes.
- Accept that thought-streaming UX loses per-step granularity (the UI only sees thoughts at end of run, not as they happen).

If we want live streaming _and_ durability, the right primitive is a separate Inngest function triggered per-step via `inngest.send` — expensive. Start without streaming; add it back via a different mechanism (e.g. direct websocket from the Inngest handler to a pub/sub layer) if needed.

### 3. Retry policy per step, not per function

With the LLM call wrapped, we can use `retries: 2` or `3` at the function level _and_ rely on Inngest's step-level memoization to avoid re-executing succeeded steps. The sandbox creation, plan fetch, message creation, and LLM generation all become safe to retry.

Non-retriable errors (auth failure, model-not-found, quota exhausted) should throw `NonRetriableError` so Inngest stops immediately instead of burning retries on a permanent failure. Wire `formatProviderError` to classify errors and throw the right type.

### 4. Typed event client

Replace per-function `parseAgentRunEvent(event.data)` with:

```ts
// inngest/client.ts
export const inngest = new Inngest({
  id: "imaginate",
  schemas: new EventSchemas().fromZod({
    "codeAgent/run": AgentRunEventSchema,
    "askAgent/run": AgentRunEventSchema,
    "planner/run": AgentRunEventSchema,
  }),
});
```

After that, `event.data` is already typed inside every handler and the `parseAgentRunEvent` helper can be deleted. `inngest.send` also gets compile-time validation.

### 5. Usage/cost logging

Log `result.usage` after every `generateText` call and aggregate it per project/day for a quota dashboard. Cheap instrumentation, big operational value.

## Scope / sequencing

Do these in this order so each can land independently:

1. **Typed event client** (#4) — pure refactor, no behavior change. Safe warm-up.
2. **`NonRetriableError` classification** (part of #3) — wraps existing catch blocks. Small.
3. **Wrap `generateText` in `step.run` + simplify tool wrappers** (#1 + #2) — the big one. Does require coordinated changes and a UX discussion about thought streaming.
4. **Enable retries with proper config** (#3) — only after #1 is landed, otherwise we reintroduce the loop.
5. **Usage logging** (#5) — anytime, but easiest after #1 since `generateText` result is a single named variable.

## Out of scope here

- Planner / multi-agent handoff logic (separate effort, deferred).
- E2B sandbox reuse / pooling (separate concern; current "new sandbox per run" is fine once retries stop leaking).
- Switching off Inngest. Not on the table.

## Current workaround

`retries: 0` on `codeAgentFunction` and `askAgentFunction`, `retries: 1` on any planner. Keeps the quota-burn loop from happening. Do not remove this until step #1 is done.
