# Agent Core Skeleton And Ports

## Goal

Create the new `src/agent` structure with domain, application, ports, adapters, and testing folders so subsequent chunks can move the already-decoupled runtime into a stable destination.

## The problem

The current reusable runtime now lives under `src/lib/agents`, including planner, executor, runner, runtime events, state, decisions, edits, telemetry, and tools. That solved reuse, but the folder still says "generic library" instead of "agent core."

Several dependencies are still implicit rather than modeled as ports: model calls, sandbox operations, message persistence, telemetry persistence, filesystem access, event emission, and logging. AI agents need a concrete folder and interface vocabulary before they can reliably place new behavior.

## What "after" looks like

Add the initial skeleton:

```txt
src/agent/
  domain/
    index.ts
    types.ts
  application/
    index.ts
    events.ts
    run-agent.ts
  ports/
    index.ts
    model-gateway.ts
    sandbox-gateway.ts
    message-store.ts
    telemetry-store.ts
    file-system.ts
    logger.ts
  adapters/
    index.ts
    memory/
      index.ts
  testing/
    index.ts
    in-memory-stores.ts
  index.ts
```

The first port definitions should be narrow and shaped by current call sites in `src/lib/agents/*`, `src/inngest/functions.ts`, `src/inngest/agent-adapter.ts`, and `scripts/agent-local.ts`:

```ts
export type AgentRuntimeDeps = {
  modelGateway: ModelGateway;
  sandboxGateway: SandboxGateway;
  messageStore: MessageStore;
  telemetryStore: TelemetryStore;
  eventSink: AgentEventSink;
  logger: AgentLogger;
};
```

The app can keep using existing `src/lib/agents` exports during this chunk. The skeleton establishes the destination and lets lint rules begin protecting new code.

## Sequencing

1. Add `src/agent` folders and barrels.
2. Define minimal ports that mirror current dependencies in `src/lib/agents`, `src/inngest/functions.ts`, and `scripts/agent-local.ts`.
3. Add in-memory/testing implementations for ports that make early unit tests possible.
4. Add placeholder `runAgent` application entrypoint that delegates to the existing `src/lib/agents` runner only if that makes chunking safer; otherwise leave it as a typed stub until chunk 3.
5. Add simple tests proving the skeleton imports follow the new boundary rules.

## Definition of done / Verification

- `src/agent` exists with public barrels and no dependency on Next, React, tRPC, Inngest, Prisma, E2B, or the AI SDK from domain/application code.
- Ports express the runtime's external needs without importing concrete SDK types.
- `npm run lint` and `npm run test` pass.
- The rebuilt architecture doc's folder map has real folders to point at.

## Out of scope

- Moving the full planner/executor runtime.
- Rewriting Inngest functions.
- Moving the local CLI from `scripts/` into `src/interfaces/cli`.

## Conflicts checked

`agent-runtime-decoupling` already introduced runtime seams under `src/lib/agents`; this chunk creates the final destination for those seams. Any overlapping `testability-refactor` work should target `src/agent/ports` and `src/agent/application` once this skeleton exists.
