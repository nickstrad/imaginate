# Runtime Orchestration And Adapters

## Goal

Move the already-extracted planner/executor orchestration from `src/lib/agents` into `src/agent/application`, while moving pure rules into `src/agent/domain` and concrete SDK/persistence bindings into adapters.

## The problem

Runtime decoupling moved `runPlanner`, `runExecutorOnce`, `runCodingAgentWithEscalation`, and `AgentRuntimeEvent` out of private Inngest-only functions. That means Inngest is no longer the sole runtime owner.

The remaining problem is architectural placement:

- `src/lib/agents` mixes pure domain rules, application orchestration, AI SDK tool factories, and telemetry persistence helpers.
- `src/lib/models`, `src/lib/sandbox`, `src/lib/db`, and `src/lib/providers` are concrete platform bindings used by the runtime.
- `src/inngest/functions.ts` and `scripts/agent-local.ts` still compose those dependencies directly.

The next migration should preserve the working behavior while giving each responsibility a final layer.

## What "after" looks like

The agent application layer owns the lifecycle:

```txt
src/agent/application/
  plan-run.ts
  execute-run.ts
  run-agent.ts
  events.ts
```

Pure logic moves into domain:

```txt
src/agent/domain/
  state.ts
  decisions.ts
  edits.ts
  verification.ts
  schemas.ts
  types.ts
```

Adapters own concrete integrations:

```txt
src/agent/adapters/
  ai-sdk/
    model-gateway.ts
    tool-factory.ts
  e2b/
    sandbox-gateway.ts
  prisma/
    message-store.ts
    telemetry-store.ts
  local-workspace/
    sandbox-gateway.ts
  memory/
    stores.ts
  terminal/
    event-sink.ts
```

The old `src/lib/agents` files are moved or kept temporarily as re-export shims with removal notes.

Example target call:

```ts
const result = await runAgent({
  input,
  history,
  deps,
});
```

`runAgent` emits structured runtime events instead of writing directly to Prisma.

## Sequencing

1. Move pure state, decision, verification, edit, and schema logic from `src/lib/agents` into `src/agent/domain`.
2. Move planner, executor attempt, escalation, and final-output acceptance into `src/agent/application`.
3. Convert model/provider calls into an AI SDK-backed `ModelGateway`.
4. Convert sandbox operations and tool construction into sandbox and tool adapters.
5. Convert telemetry and message writes into port implementations.
6. Keep `@/lib/agents` compiling through temporary re-export shims only where that lowers PR risk.
7. Keep Inngest and the local script compiling through adapter calls, then simplify their folder placement in later chunks.

## Definition of done / Verification

- The planner/executor use case is importable from `@/agent`.
- Unit tests can exercise planner fallback, escalation, verification tracking, and event emission with fake ports.
- `src/lib/agents` no longer owns the runtime; it is removed or reduced to temporary shims with named follow-up removal.
- Domain/application tests do not need Prisma, E2B, Inngest, Next, or the AI SDK.
- Existing web-triggered agent runs and `npm run agent:local` still complete successfully.

## Out of scope

- Moving `scripts/agent-local.ts` to `src/interfaces/cli`; chunk 5 owns the final local interface placement.
- Telemetry schema redesign beyond porting current behavior.
- Removing every legacy import path in this chunk if temporary shims make review safer.

## Conflicts checked

This chunk is the continuation of completed `agent-runtime-decoupling`: it changes the destination from incremental `src/lib/agents` extraction to a first-class `src/agent` runtime. It overlaps with `testability-refactor` where both introduce ports or fakes.
