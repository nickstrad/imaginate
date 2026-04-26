# Agent Core Architecture

## Goal

Redesign the app around a first-class agent core that can run from the web UI, Inngest, local scripts, tests, and future tooling without being owned by any one delivery mechanism. This is a breaking architecture plan: it intentionally replaces the current `src/lib`-as-leaf model with explicit agent, interface, feature, platform, ui, and shared layers so the codebase can grow with clearer intent and stronger import-direction invariants.

## The problem

The current architecture document's "Direction of dependencies" and "`src/lib/` - framework-agnostic building blocks" sections make `src/lib` the reusable leaf layer. That helped consolidate logic, but it now groups several different responsibilities under one broad bucket:

- Pure agent rules: `src/lib/agents/state.ts`, `src/lib/agents/decisions.ts`, `src/lib/agents/edits.ts`
- Agent orchestration that is still private to the Inngest handler: `src/inngest/functions.ts`
- Concrete platform adapters: `src/lib/db/index.ts`, `src/lib/sandbox/connect.ts`, `src/lib/models/factory.ts`, `src/lib/providers/config.ts`
- Product entrypoints: `src/modules/*/server/procedures.ts`, `src/app/**`, `src/trpc/**`, `src/inngest/**`

That mix leaves the agent runtime partly reusable and partly web/Inngest-shaped. It also gives AI agents a vague instruction: "put logic in `src/lib`." For a codebase increasingly changed by AI, the architecture should answer a sharper question: is this domain rule, use-case orchestration, concrete infrastructure, delivery adapter, product feature, or UI?

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

The agent is a core runtime, not a project feature:

```txt
src/agent/
  domain/
    run-state.ts
    decisions.ts
    verification.ts
    edits.ts
    types.ts
  application/
    plan-run.ts
    execute-run.ts
    run-agent.ts
    resume-run.ts
    events.ts
  ports/
    model-gateway.ts
    sandbox-gateway.ts
    message-store.ts
    telemetry-store.ts
    file-system.ts
    logger.ts
  adapters/
    ai-sdk/
    e2b/
    local-workspace/
    prisma/
    memory/
    terminal/
  testing/
    fake-model-gateway.ts
    fake-sandbox-gateway.ts
    in-memory-stores.ts
  index.ts
```

The import direction becomes:

```txt
app          -> interfaces, features, ui
interfaces   -> agent/application, agent/adapters, features, platform, shared
features     -> agent/application, platform, ui, shared
agent/adapters -> agent/ports, agent/domain, platform, shared
agent/application -> agent/domain, agent/ports, shared
agent/domain -> shared only
platform     -> shared only
ui           -> shared only
shared       -> shared only
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
    logger: createConsoleLogger(),
  },
});
```

## Architecture doc update

This plan requires updating `docs/architecture/architecture.md` as part of the implementation. The update should happen before or alongside the first source move so reviewers and future agents have the new map available.

The architecture doc update must:

- Replace the current top-level layout with `app`, `interfaces`, `agent`, `features`, `platform`, `ui`, `shared`, and `generated`.
- Replace the current "Direction of dependencies" graph with the target import direction above.
- Replace the "`src/lib/` - framework-agnostic building blocks" section with separate sections for `src/agent`, `src/platform`, and `src/shared`.
- Update "Where to put new code" so agent rules, agent use cases, adapters, feature workflows, delivery interfaces, and platform integrations each have an obvious destination.
- Acknowledge that this is a breaking migration from the existing `src/lib`, `src/modules`, `src/inngest`, and `src/trpc` shape, not a drift correction.
- Add lint-enforced import-boundary expectations once the boundary tooling lands.

## Sequencing

1. [Update architecture contract and boundary tooling](./01-architecture-contract-and-boundaries.md)
2. [Create the agent core skeleton and ports](./02-agent-core-skeleton-and-ports.md)
3. [Extract runtime orchestration and adapters](./03-runtime-orchestration-and-adapters.md)
4. [Rewire interfaces and features to the agent core](./04-interfaces-and-features.md)
5. [Add local runtime path and remove legacy surfaces](./05-local-runtime-and-cleanup.md)

Chunks 1 and 2 can ship together if the team wants the architecture doc, lint config, and empty skeleton to appear in one PR. Chunks 3 and 4 depend on that contract. Chunk 5 depends on the runtime being callable outside Inngest.

## Definition of done

- `docs/architecture/architecture.md` describes the new top-level architecture and no longer treats `src/lib` as the central leaf layer.
- The agent runtime can be called from Inngest and from a local script without duplicating planner/executor orchestration.
- Agent domain and application code import no Next, React, tRPC, Inngest, Prisma, E2B, or AI SDK concrete modules.
- Concrete integrations live behind ports in `agent/adapters` or shared infrastructure in `platform`.
- Product-specific workflows live in `features`; delivery mechanisms live in `interfaces`.
- Import-boundary lint rules fail CI for reverse imports and deep imports that bypass public package surfaces.
- Existing user-facing web behavior is preserved after the migration, even though the internal architecture and imports are breaking.

## Out of scope

- Replacing Next.js, tRPC, Inngest, Prisma, E2B, or the AI SDK as product/runtime choices.
- Redesigning prompts, model fallback policy, telemetry schema, or sandbox lifecycle behavior beyond what is needed to move them behind ports.
- Building a full eval harness or telemetry analytics UI.
- Preserving old import paths as long-term compatibility shims. Temporary shims are allowed only to sequence PRs safely.

## Conflicts checked

Checked `docs/plans/open/` and attempted `docs/plans/drift/` (the drift folder does not exist in this worktree). This plan intentionally conflicts with and should supersede or absorb parts of `agent-runtime-decoupling`, `testability-refactor`, and `agent-telemetry-refactor` because the goal is a breaking architecture redesign rather than an incremental refactor inside the current `src/lib` contract.
