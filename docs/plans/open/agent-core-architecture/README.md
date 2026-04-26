# Agent Core Architecture

## Goal

Move from the current incremental `src/lib/agents` runtime shape to a first-class agent architecture with explicit core, interface, feature, platform, UI, and shared layers. The immediate runtime decoupling work is complete: planner/executor orchestration, runtime events, the Inngest adapter, and `npm run agent:local` now exist under the old architecture. This plan starts from that baseline and defines the next breaking migration.

The plan also owns rebuilding `docs/architecture/architecture.md`. That file is intentionally blank while this architecture is being redesigned; the first chunk writes the new source of truth before source moves begin.

## The problem

The completed runtime-decoupling work made the agent callable outside Inngest, but it did so inside the old folder contract:

- Reusable runtime code lives in `src/lib/agents/{planner,executor,runner,runtime}.ts`.
- Inngest composition lives in `src/inngest/functions.ts` and `src/inngest/agent-adapter.ts`.
- The local script lives in `scripts/agent-local.ts`.
- Product entrypoints still use `src/app`, `src/modules`, `src/trpc`, and `src/inngest`.

That is a good working baseline, but not the final architecture. The next migration should give the agent an explicit home and make delivery mechanisms, product features, concrete infrastructure, and pure shared code separable by folder and import rules.

## What "after" looks like

The target top-level shape is:

```txt
src/
  app/          Next.js App Router routes, layouts, and route handlers
  interfaces/   Delivery mechanisms: tRPC, Inngest, CLI/scripts, HTTP adapters
  agent/        First-class reusable agent runtime
  features/     Product workflows and UI-facing feature composition
  platform/     Concrete infrastructure adapters shared across runtimes
  ui/           Cross-feature presentation primitives and hooks
  shared/       Tiny framework-neutral utilities, schemas, and test support
  generated/    Generated clients; never edited directly
```

The agent runtime becomes:

```txt
src/agent/
  domain/        Pure state, decisions, verification, edits, schemas, and types
  application/   Planner/executor use cases and runtime event contract
  ports/         Model, sandbox, message, telemetry, filesystem, and logging boundaries
  adapters/      AI SDK, E2B, Prisma, local workspace, memory, and terminal bindings
  testing/       Fakes and in-memory implementations for tests
  index.ts
```

Entrypoints compose dependencies and call use cases:

```ts
await runAgent({
  input,
  deps: {
    modelGateway: createAiSdkModelGateway(),
    sandboxGateway: createE2bSandboxGateway(),
    messageStore: createPrismaMessageStore(),
    telemetryStore: createPrismaTelemetryStore(),
    eventSink,
    logger,
  },
});
```

Local scripts use the same application code with different adapters:

```ts
await runAgent({
  input,
  deps: {
    modelGateway: createAiSdkModelGateway(),
    sandboxGateway: createLocalWorkspaceGateway(process.cwd()),
    messageStore: createInMemoryMessageStore(),
    telemetryStore: createFileTelemetryStore(".agent-runs"),
    eventSink: createTerminalEventSink(),
    logger: createConsoleAgentLogger(),
  },
});
```

## Architecture doc deliverable

`docs/architecture/architecture.md` is part of this plan, not an input constraint. Chunk 1 must write the new architecture document from the target design, including:

- The new top-level layout.
- Dependency direction between `app`, `interfaces`, `agent`, `features`, `platform`, `ui`, `shared`, and `generated`.
- Folder conventions for `src/agent`, `src/interfaces`, `src/features`, `src/platform`, and `src/shared`.
- A "Where to put new code" table for future agents.
- A short migration note explaining that the old `src/lib`-centered architecture has been retired.
- Import-boundary lint expectations that can be tightened as migration chunks land.

## Sequencing

1. [Write the architecture contract and boundary plan](./01-architecture-contract-and-boundaries.md)
2. [Create the agent core skeleton and ports](./02-agent-core-skeleton-and-ports.md)
3. [Migrate runtime orchestration and adapters](./03-runtime-orchestration-and-adapters.md)
4. [Rewire interfaces and features](./04-interfaces-and-features.md)
5. [Move the local runtime path and remove legacy surfaces](./05-local-runtime-and-cleanup.md)

Chunks 1 and 2 can ship together if the team wants the new doc, boundary tooling, and empty destination folders in one PR. Chunks 3-5 depend on chunk 1 because they intentionally follow the new architecture document.

## Definition of done

- `docs/architecture/architecture.md` has been rebuilt around the new architecture.
- The agent runtime can still be called from Inngest and from a local script.
- Agent domain and application code import no Next, React, tRPC, Inngest, Prisma, E2B, or AI SDK concrete modules.
- Concrete integrations live behind ports in `src/agent/adapters` or shared infrastructure in `src/platform`.
- Product-specific workflows live in `src/features`; delivery mechanisms live in `src/interfaces`.
- Import-boundary lint rules fail CI for reverse imports and deep imports that bypass public package surfaces.
- Existing user-facing web behavior and `npm run agent:local` behavior are preserved after the migration.

## Out of scope

- Replacing Next.js, tRPC, Inngest, Prisma, E2B, or the AI SDK as product/runtime choices.
- Redesigning prompts, model fallback policy, telemetry schema, or sandbox lifecycle behavior beyond what is needed to move them behind ports.
- Building a full eval harness or telemetry analytics UI.
- Preserving old import paths as long-term compatibility shims. Temporary shims are allowed only to sequence PRs safely.

## Conflicts checked

Checked `docs/plans/open/`; `docs/plans/drift/` does not exist in this worktree. `agent-runtime-decoupling` is treated as completed baseline work, not a competing destination. This plan intentionally overlaps with `testability-refactor` and `agent-telemetry-refactor`; overlapping pieces should either be absorbed into this migration or kept narrowly scoped to behavior/schema changes that survive the new architecture.
