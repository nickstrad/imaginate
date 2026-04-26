# Runtime Orchestration And Adapters

## Goal

Move planner/executor orchestration out of `src/inngest/functions.ts` and into `src/agent/application`, while moving concrete SDK and persistence bindings into adapters.

## The problem

`src/inngest/functions.ts` currently owns too much of the agent lifecycle: planning, model provider selection, executor attempts, escalation, sandbox tool wiring, telemetry assembly, thought persistence, final result persistence, and provider error handling. That makes Inngest the real runtime owner even though the agent should run from UI-triggered workflows, local scripts, tests, and future interfaces.

The current `src/lib/agents` pieces are useful but incomplete: they provide schemas, state helpers, decisions, tools, and telemetry helpers, but not the full application use case.

## What "after" looks like

The agent application layer owns the lifecycle:

```txt
src/agent/application/
  plan-run.ts
  execute-run.ts
  run-agent.ts
  events.ts
```

The adapters own concrete integrations:

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
  terminal/
    event-sink.ts
```

The old `src/lib/agents` files are either moved into `src/agent/domain`, moved into `src/agent/application`, or kept temporarily as re-export shims with a removal note.

Example target call:

```ts
const result = await runAgent({
  input,
  history,
  deps,
});
```

`runAgent` emits structured runtime events instead of writing directly to Prisma:

```ts
type AgentRuntimeEvent =
  | { type: "planner.started" }
  | { type: "planner.finished"; plan: AgentPlan }
  | { type: "executor.attempt.started"; attempt: number; model: string }
  | { type: "executor.step.finished"; step: AgentStepSummary }
  | { type: "executor.escalated"; reason: string }
  | { type: "agent.finished"; result: AgentRunResult };
```

## Sequencing

1. Move pure state, decision, verification, edit, and schema logic from `src/lib/agents` into `src/agent/domain`.
2. Extract planner, executor attempt, escalation, and final-output acceptance into `src/agent/application`.
3. Convert model/provider calls into an AI SDK-backed `ModelGateway`.
4. Convert sandbox operations and tool construction into sandbox and tool adapters.
5. Convert telemetry and message writes into port implementations.
6. Keep `src/inngest/functions.ts` compiling through a temporary adapter call, then simplify it in chunk 4.

## Definition of done / Verification

- The planner/executor use case is importable from `@/agent`.
- Unit tests can exercise planner fallback, escalation, verification tracking, and event emission with fake ports.
- Inngest no longer contains private `runPlanner`, `runExecutorOnce`, or `runCodingAgentWithEscalation` functions.
- Domain/application tests do not need Prisma, E2B, Inngest, Next, or the AI SDK.
- Existing web-triggered agent runs still complete successfully.

## Out of scope

- A polished local CLI. Chunk 5 owns that.
- Telemetry schema redesign beyond porting current behavior.
- Removing every legacy `src/lib` import path in this chunk if temporary shims make review safer.

## Conflicts checked

This chunk absorbs most of `agent-runtime-decoupling` and multiple `testability-refactor` chunks. The overlap is intentional: this plan changes the destination from incremental `src/lib/agents` extraction to a first-class `src/agent` runtime.
