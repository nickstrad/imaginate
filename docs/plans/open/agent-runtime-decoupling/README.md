# Agent Runtime Decoupling

## Goal

Make the planner/executor orchestration reusable outside Inngest while preserving the current Inngest behavior.

The immediate payoff is a fast local script for agent development:

```bash
npm run agent:local -- "add a dark mode toggle"
```

That script should exercise the same planner, executor ladder, tools, model selection, telemetry assembly, and final-output logic as the web/Inngest path, without requiring the Next app, tRPC request flow, or Inngest dev server.

## Current Shape

Today the reusable low-level pieces already live under `src/lib/agents`:

- schemas: `PlanOutputSchema`, `FinalOutputSchema`, verification records
- state: `createRunState`, verification tracking
- decisions: `shouldEscalate`, `extractTaskSummary`, step text parsing
- tools: AI SDK tool factories with injected `{ getSandbox, runState }`
- telemetry: `buildTelemetry`, `persistTelemetryWith`

The missing layer is the orchestration. `runPlanner`, `runExecutorOnce`, and `runCodingAgentWithEscalation` are currently private functions inside `src/inngest/functions.ts`, and the executor step callback directly writes thoughts/telemetry to Prisma.

## Target Shape

```txt
src/lib/agents/
  planner.ts       runPlanner()
  executor.ts      runExecutorOnce()
  runner.ts        runCodingAgentWithEscalation()
  runtime.ts       AgentRuntimeHooks, AgentRuntimeEvent, shared types

src/inngest/functions.ts
  Thin adapter:
  - wraps plan/execute in step.run
  - creates/persists app messages
  - creates/connects sandbox
  - maps runtime events to Prisma thoughts/telemetry updates

scripts/agent-local.ts
  Local adapter:
  - accepts a prompt
  - creates/connects sandbox
  - calls the same lib runner directly
  - prints runtime events and final output to stdout
```

## Runtime Contract

Start small. Avoid building a framework.

```ts
export type AgentRuntimeHooks = {
  getSandbox: () => Promise<SandboxLike>;
  emit?: (event: AgentRuntimeEvent) => void | Promise<void>;
  persistTelemetry?: (payload: TelemetryPayload) => void | Promise<void>;
};
```

`emit` is the primary extension point. Inngest uses it to persist thoughts and progress. Local scripts use it to print live progress. Future evals can write JSONL.

Candidate event names:

- `planner.started`
- `planner.finished`
- `planner.failed`
- `executor.attempt.started`
- `executor.step.finished`
- `executor.attempt.failed`
- `executor.escalated`
- `executor.accepted`
- `agent.finished`

## Chunk Order

1. [Extract runtime types and planner](./01-runtime-and-planner.md)
2. [Extract executor and runner](./02-executor-and-runner.md)
3. [Convert Inngest into an adapter](./03-inngest-adapter.md)
4. [Add local agent script](./04-local-script.md)
5. [Later: eval harness](./05-eval-harness.md)

## Definition Of Done

- Inngest code path behavior is unchanged from the user's perspective.
- Planner/executor orchestration can be imported from `@/lib/agents`.
- A local CLI script can run the same agent runner without the web app or Inngest server.
- Runtime progress is observable through structured events.
- Unit tests cover planner fallback, executor escalation, and event emission with fake model/sandbox dependencies where practical.
