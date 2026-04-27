# Agent Core Architecture

## Goal

Move from the old incremental `src/lib`-centered runtime shape to a first-class agent architecture with explicit core, interface, feature, platform, UI, and shared layers. Chunks 1-4 establish the target architecture, move the agent runtime to `src/agent`, and move delivery/product code to `src/interfaces` and `src/features`. The remaining migration work is the final `src/lib` cleanup.

The plan also owns keeping `docs/architecture/architecture.md` aligned with the migration as source folders move.

## The problem

The completed migration chunks made the agent callable outside Inngest and moved the main delivery/product surfaces, but one old folder contract remains:

- Inngest composition lives in `src/interfaces/inngest/functions.ts` and `src/interfaces/inngest/agent-adapter.ts`.
- The local CLI lives in `src/interfaces/cli/agent-local.ts` and already supports prompt input, create/connect sandbox modes, JSONL output, runtime event streaming, preview readiness, final verification/file/usage output, and follow-up commands with `--sandbox-id`.
- Product entrypoints use `src/app`, `src/interfaces`, and `src/features`; the remaining legacy surface is `src/lib/**`.

That is a good working baseline, but not the final architecture. Chunk 5 should make concrete infrastructure and pure shared code separable by folder and import rules, then remove the last legacy boundary exception.

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

The CLI becomes a supported development surface:

```bash
npm run agent:local -- "add a settings panel"
npm run agent:local -- --sandbox-id sbx_existing "now add tests"
npm run agent:local -- --json --prompt "summarize the agent runtime"
```

It should expose the same runtime events, final output, verification records, files written, token usage, sandbox URL, and follow-up command that `src/interfaces/cli/agent-local.ts` exposes today.

## Architecture doc deliverable

`docs/architecture/architecture.md` is part of this plan, not an input constraint. Chunk 1 must write the new architecture document from the target design, including:

- The new top-level layout.
- Dependency direction between `app`, `interfaces`, `agent`, `features`, `platform`, `ui`, `shared`, and `generated`.
- Folder conventions for `src/agent`, `src/interfaces`, `src/features`, `src/platform`, and `src/shared`.
- A "Where to put new code" table for future agents.
- A CLI section that names `agent:local` as the supported non-web agent interface and explains where CLI-specific code belongs.
- A short migration note explaining that the old `src/lib`-centered architecture has been retired.
- Import-boundary lint expectations that can be tightened as migration chunks land.

## Sequencing

1. [Write the architecture contract and boundary plan](./01-architecture-contract-and-boundaries.md)
2. [Create the agent core skeleton and ports](./02-agent-core-skeleton-and-ports.md)
3. [Migrate runtime orchestration and adapters](./03-runtime-orchestration-and-adapters.md)
4. [Rewire interfaces and features](./04-interfaces-and-features.md)
5. [Clean up platform/shared infrastructure and remove legacy surfaces](./05-local-runtime-and-cleanup.md)

Chunks 1 and 2 can ship together if the team wants the new doc, boundary tooling, and empty destination folders in one PR. Chunks 3-5 depend on chunk 1 because they intentionally follow the new architecture document.

## Definition of done

- `docs/architecture/architecture.md` has been rebuilt around the new architecture.
- The agent runtime can still be called from Inngest and from a local script.
- Agent domain and application code import no Next, React, tRPC, Inngest, Prisma, E2B, or AI SDK concrete modules.
- Concrete integrations live behind ports in `src/agent/adapters` or shared infrastructure in `src/platform`.
- Product-specific workflows live in `src/features`; delivery mechanisms live in `src/interfaces`.
- The CLI is a first-class interface for developing and debugging the agent without running the web app.
- Import-boundary lint rules fail CI for reverse imports and deep imports that bypass public package surfaces.
- Existing user-facing web behavior and `npm run agent:local` behavior are preserved after the migration.
- Superseded plans are retired under the archive-or-delete policy in `docs/plans/AGENTS.md`, with durable facts folded into source-of-truth docs first.

## Out of scope

- Replacing Next.js, tRPC, Inngest, Prisma, E2B, or the AI SDK as product/runtime choices.
- Redesigning prompts, model fallback policy, telemetry schema, or sandbox lifecycle behavior beyond what is needed to move them behind ports.
- Building a full eval harness or telemetry analytics UI.
- Preserving old import paths as long-term compatibility shims. Temporary shims are allowed only to sequence PRs safely.

## Conflicts checked

Checked `docs/plans/open/` and `docs/plans/drift/`. `agent-runtime-decoupling` is treated as completed baseline work, not a competing destination. This plan intentionally overlaps with `testability-refactor` and `agent-telemetry-refactor`; overlapping pieces should either be absorbed into this migration or kept narrowly scoped to behavior/schema changes that survive the new architecture.
