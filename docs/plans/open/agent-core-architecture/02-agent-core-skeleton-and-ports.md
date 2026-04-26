# Agent Core Skeleton And Ports

## Goal

Create the new `src/agent` structure with domain, application, ports, adapters, and testing folders so subsequent chunks can move behavior into a stable destination without inventing structure mid-refactor.

## The problem

Current reusable pieces live under `src/lib/agents`, but orchestration still lives in `src/inngest/functions.ts`. Several dependencies are implicit rather than modeled as ports: model calls, sandbox operations, message persistence, telemetry persistence, filesystem access, event emission, and logging.

AI agents need a concrete folder and interface vocabulary before they can reliably place new behavior.

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

The first port definitions should be narrow and shaped by current call sites, not speculative abstractions. For example:

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
2. Define minimal ports that mirror current dependencies in `src/inngest/functions.ts` and `src/lib/agents/tools.ts`.
3. Add in-memory/testing implementations for ports that make early unit tests possible.
4. Add placeholder `runAgent` application entrypoint that throws or delegates temporarily until chunk 3 extracts the real runtime.
5. Add simple tests proving the skeleton imports follow the new boundary rules.

## Definition of done / Verification

- `src/agent` exists with public barrels and no dependency on Next, React, tRPC, Inngest, Prisma, E2B, or the AI SDK from domain/application code.
- Ports express the runtime's external needs without importing concrete SDK types.
- `npm run lint` and `npm run test` pass.
- The architecture doc's new folder map has real folders to point at.

## Out of scope

- Moving the full planner/executor runtime.
- Rewriting Inngest functions.
- Adding local CLI behavior beyond test-only in-memory adapters.

## Conflicts checked

This overlaps with `agent-runtime-decoupling` and `testability-refactor`, which also introduce runtime seams. The new plan supersedes their destination: new runtime seams belong under `src/agent/ports` and `src/agent/application`, not under additional files in `src/lib/agents`.
