# Chunk 1: Runtime Types And Planner Extraction

## Goal

Move planner orchestration out of `src/inngest/functions.ts` into `src/lib/agents` with a minimal hook/event contract.

This chunk should be safe to land alone: Inngest still calls the same planner behavior, but the planner no longer lives in the Inngest module.

## Files

- Add `src/lib/agents/runtime.ts`
- Add `src/lib/agents/planner.ts`
- Update `src/lib/agents/index.ts`
- Update `src/inngest/functions.ts`
- Add or update planner tests under `src/lib/agents`

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

## Acceptance

- `src/inngest/functions.ts` imports `runPlanner` from `@/lib/agents`.
- No `runPlanner` implementation remains in `src/inngest/functions.ts`.
- Existing Inngest behavior is unchanged.
- `npm test -- src/lib/agents` passes.
