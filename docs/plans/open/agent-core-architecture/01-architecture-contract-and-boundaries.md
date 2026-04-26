# Architecture Contract And Boundaries

## Goal

Replace the current documented `src/lib`-centered dependency model with the new agent-core architecture, then make the most important import direction rules executable through linting.

## The problem

The current `docs/architecture/architecture.md` "Direction of dependencies" section says `src/lib` is the leaf layer, and the "`src/lib/` - framework-agnostic building blocks" section directs reusable logic into `src/lib/<concern>`. The agent has outgrown that bucket. It needs pure rules, use cases, ports, adapters, local runtime support, and product integrations that should not all share the same architectural label.

Without changing the architecture doc first, later source moves will look like drift from the current documented rules.

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

The repo also gains lint rules that express the same boundary. Start with the highest-value checks:

- `agent/domain/**` cannot import from `app`, `interfaces`, `features`, `platform`, `ui`, `generated`, or concrete SDK packages.
- `agent/application/**` cannot import from `agent/adapters`, `app`, `interfaces`, `features`, `ui`, or concrete SDK packages.
- `platform/**` cannot import from `app`, `interfaces`, `features`, `agent`, or `ui`.
- `features/**` cannot import from `interfaces` or `app`.
- `app/**` should not import `agent/adapters/**` directly; interface adapters own composition.

## Sequencing

1. Update `docs/architecture/architecture.md` with the new top-level layout, dependency direction, and "Where to put new code" table.
2. Add or choose ESLint boundary tooling.
3. Configure rules in warning mode only if needed during the first migration PR; otherwise use errors from the start.
4. Add temporary exceptions for legacy paths that are removed by later chunks, with comments that name the chunk that removes each exception.
5. Update `docs/code-style/AGENTS.md` only if a human convention remains that lint cannot enforce.

## Definition of done / Verification

- `docs/architecture/architecture.md` reflects the new design before source files are reorganized around it.
- `npm run lint` runs with the new boundary configuration.
- Boundary failures produce messages that tell contributors which layer they crossed and where the code should move.
- Any temporary lint exceptions are named and tied to this plan's later chunks.

## Out of scope

- Moving all source files in this chunk.
- Deciding final telemetry or eval schema.
- Replacing the current app behavior.

## Conflicts checked

This chunk intentionally conflicts with the current architecture document and with open plans that assume `src/lib/agents` remains the final runtime location. The conflict is expected because this plan changes the architecture contract before implementing the breaking migration.
