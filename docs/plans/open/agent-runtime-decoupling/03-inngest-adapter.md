# Chunk 3: Inngest Adapter

## Goal

Keep Inngest as a thin adapter around the extracted planner/executor runtime.

Chunks 1 and 2 have already moved the orchestration into `src/lib/agents`.
This chunk finishes the adapter boundary: Inngest owns durable steps, app
persistence, and sandbox lifecycle, while the runtime owns planner/executor
control flow.

## Current State

The extracted runtime already lives under `src/lib/agents`:

- `planner.ts` exports `runPlanner`.
- `executor.ts` exports `runExecutorOnce`.
- `runner.ts` exports `runCodingAgentWithEscalation`.
- `runtime.ts` exports `AgentRuntimeEventType`, runtime events, hooks, and
  `ExecuteOutcome`.
- Planner, executor, runner, telemetry, decisions, edits, and state tests are
  colocated under `src/lib/agents`.

`src/inngest/functions.ts` is already the main durable workflow adapter. It
still owns:

- `inngest.createFunction(...)` declarations.
- `loggedStep(...)` and high-level `step.run(...)` boundaries.
- assistant message creation.
- no-code answer persistence.
- sandbox creation and preview URL lookup.
- provider-error persistence.
- final `Message` and `Fragment` persistence.

`src/inngest/agent-adapter.ts` owns Inngest-specific runtime glue:

- runtime hook construction through `buildAgentHooks(...)`.
- runtime event logging through `logAgentRuntimeEvent(...)`.
- mapping `executor.step.finished` events to Prisma thought persistence.

The extracted runtime owns:

- planner model calls.
- executor model calls.
- tool construction.
- executor ladder traversal.
- escalation decisions.
- usage accumulation.
- task-summary final-output fallback.
- runtime event emission.

This respects the architecture rule in `src/` Architecture > `Direction of
dependencies`: `src/inngest` may import `src/lib`, while runtime code must not
import from `src/inngest`.

## Adapter Hook Behavior

Build the hooks in `src/inngest/agent-adapter.ts`, then pass them near the
`execute` step. The important detail is that `runExecutorOnce` already pushes
each parsed thought into the shared `thoughts` array before it emits
`executor.step.finished`. The Inngest hook must persist that existing array; it
must not push `event.step.thought` again.

```ts
const runtimeHooks: AgentRuntimeHooks = {
  getSandbox: () => getSandbox(sandboxId),
  persistTelemetry: (payload) => persistTelemetry(persistedMessage.id, payload),
  emit: async (event) => {
    logAgentRuntimeEvent(log, event);

    if (event.type === AgentRuntimeEventType.ExecutorStepFinished) {
      await prisma.message.update({
        where: { id: persistedMessage.id },
        data: { thoughts: thoughtsToPrismaJson(thoughts) },
      });
    }
  },
};
```

Planner events can use the same log-only event sink:

```ts
const plan = await loggedStep(log, step, "plan", () =>
  runPlanner({
    userPrompt,
    previousMessages: previousMessages as ModelMessage[],
    log,
    hooks: {
      emit: (event) => logAgentRuntimeEvent(log, event),
    },
  })
);
```

## Durable Step Boundaries

Keep the current high-level Inngest durability:

```ts
const plan = await loggedStep(log, step, "plan", () => runPlanner(...));

const executeOutcome = await loggedStep(log, step, "execute", () =>
  runCodingAgentWithEscalation(...)
);
```

Do not put `step.run` inside `src/lib/agents`. Tool execution and model calls
stay in the runtime, but Inngest checkpointing stays in `src/inngest`.

## Target Integration

The final Inngest code should continue to read as adapter code: prepare app
state, call runtime, persist result.

```ts
const executeOutcome = await loggedStep(log, step, "execute", () =>
  runCodingAgentWithEscalation({
    thoughts,
    cumulativeUsage,
    plan,
    runState,
    previousMessages: previousMessages as ModelMessage[],
    userPrompt,
    log,
    hooks: buildAgentHooks({
      sandboxId,
      persistedMessageId: persistedMessage.id,
      thoughts,
      log,
    }),
  })
);

// Restore post-step state from the cached step return (Inngest replays don't
// re-run step.run callbacks, so in-closure runState mutations are lost).
const finalRunState = executeOutcome.runState;
const finalOutput = finalRunState.finalOutput;
```

Final result persistence remains in Inngest:

- classify and persist provider errors when execution failed before a final
  output exists.
- call `ensurePreviewReady(...)` and `getSandboxUrl(...)` after the execute
  step.
- persist the final message and fragment.
- persist final telemetry from the returned `ExecuteOutcome`.

Keep `buildAgentHooks(...)` and `logAgentRuntimeEvent(...)` in
`src/inngest/agent-adapter.ts`. That file may contain adapter glue and app
persistence wiring, but must not move runtime policy back into Inngest.

## Replay Note

Preserve the replay-sensitive behavior already documented in code:

> Inngest replays don't re-run step.run callbacks, so in-closure runState
> mutations are lost.

`ExecuteOutcome` must continue returning the final `runState`, `stepsCount`,
usage totals, and last error message. The Inngest adapter should read final
state from the returned outcome after the `execute` step.

## Definition Of Done / Verification

- `src/inngest/functions.ts` remains mostly adapter code and delegates planner
  and executor orchestration to `@/lib/agents`.
- `src/inngest/agent-adapter.ts` owns runtime-event logging, runtime hook
  construction, and thought persistence for executor step events.
- Inngest still persists thoughts, telemetry, provider errors, final messages,
  and fragments exactly as before.
- `src/lib/agents/{planner,executor,runner,runtime}.ts` do not import Prisma or
  Inngest.
- `src/lib/agents/telemetry.ts` may keep the Prisma-backed
  `persistTelemetry(...)` helper described by the architecture doc; persistence
  remains injectable through `persistTelemetryWith(...)`.
- `npm test -- src/lib/agents` passes.
- `npm run build` passes if this chunk changes `src/inngest/functions.ts`.
- `npm run format:check -- docs/plans/open/agent-runtime-decoupling/03-inngest-adapter.md src/inngest/functions.ts src/lib/agents`
  passes, except for any pre-existing unrelated formatting failure outside
  these paths.

## Out Of Scope

- Adding the local CLI script. Chunk 4 owns that.
- Adding the eval harness. Chunk 5 owns that.
- Redesigning telemetry schema or analytics queries. The
  `agent-telemetry-refactor` plan owns that.
- Moving the runtime into a future `src/agent` architecture. The
  `agent-core-architecture` plan owns that broader destination.

## Conflicts Checked

Reviewed `docs/plans/open/`; `docs/plans/drift/` is absent in `wt-agent-03`.
Overlap with `testability-refactor/06-persist-run-helper.md` and
`testability-refactor/07-split-executor-step-callback.md` is limited to future
persistence/testability cleanup. Overlap with
`agent-core-architecture/03-runtime-orchestration-and-adapters.md` is
intentional: this chunk finishes the near-term `src/lib/agents` adapter
boundary, while `agent-core-architecture` describes a broader future move to a
first-class `src/agent` runtime.
