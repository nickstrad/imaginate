# Architecture Contract And Boundaries

## Goal

Write the new `docs/architecture/architecture.md` from a blank slate, then make the most important import direction rules executable through linting.

## The problem

`docs/architecture/architecture.md` has been cleared because the old `src/lib`-centered architecture is no longer the direction for this migration. The repo now has a useful runtime-decoupled baseline under the old structure, but future agents need a current map before source files start moving.

Without a rebuilt architecture contract, the next chunks would create new folders and import rules without a source of truth.

## What "after" looks like

`docs/architecture/architecture.md` describes this top-level layout:

```txt
src/
  app/
  interfaces/
  agent/
  features/
  platform/
  ui/
  shared/
  generated/
```

And this dependency graph:

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

The document should explicitly name the completed runtime-decoupling baseline so readers understand the migration path:

```txt
current baseline:
  src/lib/agents/{planner,executor,runner,runtime}.ts
  src/inngest/agent-adapter.ts
  scripts/agent-local.ts

target destination:
  src/agent/application/
  src/agent/domain/
  src/agent/ports/
  src/agent/adapters/
  src/interfaces/inngest/
  src/interfaces/cli/
```

The architecture document should call out the CLI as a supported interface, not as an incidental script. The CLI exists so agent changes can be developed, debugged, and iterated without starting the web app, tRPC route, or Inngest dev server.

The repo also gains lint rules that express the same boundary. Start with the highest-value checks:

- `agent/domain/**` cannot import from `app`, `interfaces`, `features`, `platform`, `ui`, `generated`, or concrete SDK packages.
- `agent/application/**` cannot import from `agent/adapters`, `app`, `interfaces`, `features`, `ui`, or concrete SDK packages.
- `platform/**` cannot import from `app`, `interfaces`, `features`, `agent`, or `ui`.
- `features/**` cannot import from `interfaces` or `app`.
- `app/**` should not import `agent/adapters/**` directly; interface adapters own composition.

## Sequencing

1. Rebuild `docs/architecture/architecture.md` with the new top-level layout, dependency direction, folder conventions, and "Where to put new code" table.
2. Document `src/interfaces/cli` as the home for `agent:local`, including the expectation that it can run the agent without the web app or Inngest.
3. Include a migration note that the old architecture was intentionally retired and that `src/lib/agents` is a temporary baseline, not the final destination.
4. Add or choose ESLint boundary tooling.
5. Configure rules in warning mode only if needed during the first migration PR; otherwise use errors from the start.
6. Add temporary exceptions for legacy paths that are removed by later chunks, with comments that name the chunk that removes each exception.
7. Update `docs/code-style/AGENTS.md` only if a human convention remains that lint cannot enforce.

## Definition of done / Verification

- `docs/architecture/architecture.md` exists again and describes the new design before source files are reorganized around it.
- The architecture doc no longer points contributors to `src/lib` as the central reusable leaf layer.
- The architecture doc names the CLI as a first-class agent interface and points CLI code to `src/interfaces/cli`.
- `npm run lint` runs with the new boundary configuration or documented temporary warning-mode rules.
- Boundary failures produce messages that tell contributors which layer they crossed and where the code should move.
- Any temporary lint exceptions are named and tied to this plan's later chunks.

## Out of scope

- Moving all source files in this chunk.
- Deciding final telemetry or eval schema.
- Replacing current app or local-agent behavior.

## Conflicts checked

This chunk intentionally replaces the blanked architecture document. `agent-runtime-decoupling` is baseline work that already landed under the old layout; this chunk documents where that runtime moves next.
