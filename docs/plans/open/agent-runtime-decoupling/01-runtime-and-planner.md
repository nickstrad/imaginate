# Chunk 1: Runtime Types And Planner Extraction

## Goal

Move planner orchestration out of `src/inngest/functions.ts` into `src/lib/agents` with a minimal hook/event contract.

This chunk should be safe to land alone: Inngest still calls the same planner behavior, but the planner no longer lives in the Inngest module.

## Files

- Add `src/lib/agents/runtime.ts`
- Add `src/lib/agents/planner.ts`
- Add `src/lib/agents/planner.test.ts`
- Update `src/lib/agents/index.ts` (barrel re-exports `runtime` + `planner`)
- Update `src/inngest/functions.ts` (import `runPlanner`, `planSnippet` from `@/lib/agents`)

`planSnippet` moves into `planner.ts` rather than `decisions.ts`. It is planner-output formatting, used today only to build the executor's system prompt; chunk 02 will import it from `@/lib/agents` along with `runPlanner`. Keeping both in `planner.ts` keeps the planner-shaped surface area in one place.

## Implementation

Create `AgentRuntimeEvent` and `AgentRuntimeHooks` in `runtime.ts`.

Keep the first version intentionally small:

```ts
export type AgentRuntimeEvent =
  | { type: "planner.started" }
  | { type: "planner.finished"; plan: PlanOutput }
  | { type: "planner.failed"; error: string };

export type AgentRuntimeHooks = {
  emit?: (event: AgentRuntimeEvent) => void | Promise<void>;
};
```

Move `planSnippet` and `runPlanner` into `planner.ts`.

Recommended exported shape:

```ts
export function planSnippet(plan: PlanOutput | undefined): string;

export async function runPlanner(input: {
  userPrompt: string;
  previousMessages: ModelMessage[];
  log: Logger;
  hooks?: AgentRuntimeHooks;
}): Promise<PlanOutput>;
```

This is a deliberate breaking change to the current `runPlanner(userPrompt, previousMessages, log)` signature. The only caller is `src/inngest/functions.ts` in this repo; update it in the same PR. The options-object form matches the runner/executor APIs that chunks 02–03 will introduce.

Keep existing behavior:

- resolve planner model with `resolvePlannerModel`
- use `PLANNER_PROMPT`
- call the `submitPlan` tool
- stop when structured plan is captured
- on provider failure, log warning and fall back to coding-required default plan
- preserve `CACHE_PROVIDER_OPTIONS`

## Tests

Add tests for:

- planner emits `planner.started`
- planner emits `planner.finished` when plan is captured
- planner emits `planner.failed` and returns fallback plan when `generateText` throws

If mocking `generateText` is too awkward in this chunk, add narrower tests for `planSnippet` and defer model-call tests to the runner extraction.

## Target Integration Example

As if this chunk were complete, the extracted planner API would look like this:

```ts
// src/lib/agents/planner.ts
export async function runPlanner({
  userPrompt,
  previousMessages,
  log,
  hooks,
}: {
  userPrompt: string;
  previousMessages: ModelMessage[];
  log: Logger;
  hooks?: AgentRuntimeHooks;
}): Promise<PlanOutput> {
  await hooks?.emit?.({ type: "planner.started" });

  try {
    // existing generateText + submitPlan tool logic
    const plan = captured ?? fallbackPlan();
    await hooks?.emit?.({ type: "planner.finished", plan });
    return plan;
  } catch (err) {
    await hooks?.emit?.({ type: "planner.failed", error: String(err) });
    return fallbackPlan();
  }
}
```

The Inngest function would call it through a durable step:

```ts
// src/inngest/functions.ts
const plan = await loggedStep(log, step, "plan", () =>
  runPlanner({
    userPrompt,
    previousMessages: previousMessages as ModelMessage[],
    log,
    hooks: {
      emit: (event) => {
        if (event.type === "planner.finished") {
          log.info({
            event: "planner finished",
            metadata: { taskType: event.plan.taskType },
          });
        }
      },
    },
  })
);

runState.plan = plan;
```

A local script could call the same planner directly:

```ts
// scripts/agent-local.ts
const plan = await runPlanner({
  userPrompt,
  previousMessages: [],
  log,
  hooks: {
    emit: (event) => console.log(formatAgentEvent(event)),
  },
});

console.log(planSnippet(plan));
```

## Out Of Scope

- Wiring `hooks.emit` to persist thoughts or telemetry in the Inngest adapter. Chunk 01 only defines the event types and emits them from the planner; the Inngest call site may pass `hooks` with a no-op or log-only `emit`. Mapping events → Prisma writes is chunk 03.
- Extracting the executor or runner. Chunk 02.
- Adding non-planner events (`executor.*`, `agent.finished`) to `AgentRuntimeEvent`. Those land with the code that emits them in chunk 02.

## Conflicts Checked

Reviewed `docs/plans/open/` and `docs/plans/drift/` (drift folder absent). No overlap with `agent-telemetry-refactor/` (changes telemetry schema/queries, not orchestration). `testability-refactor/07-split-executor-step-callback.md` touches the executor step callback only — chunk 02 territory, no conflict with the planner extraction here.

## Acceptance

- `src/lib/agents/runtime.ts` exports `AgentRuntimeEvent` and `AgentRuntimeHooks`.
- `src/lib/agents/planner.ts` exports `runPlanner` (options-object signature) and `planSnippet`; both are re-exported from `@/lib/agents`.
- `src/inngest/functions.ts` imports `runPlanner` and `planSnippet` from `@/lib/agents`; no `runPlanner` or `planSnippet` implementation remains there.
- Existing Inngest behavior is unchanged (planner fallback path still produces the same default `PlanOutput`; `CACHE_PROVIDER_OPTIONS` still applied).
- `npm test -- src/lib/agents` passes.
