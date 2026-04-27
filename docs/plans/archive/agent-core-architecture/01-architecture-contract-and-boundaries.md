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

The boundary tool is `eslint-plugin-boundaries`, configured in the existing flat `eslint.config.mjs` on top of `next/core-web-vitals` + `next/typescript`. Element types declared in chunk 1:

```txt
target elements:  app, interfaces, agent-domain, agent-application,
                  agent-ports, agent-adapters, features, platform,
                  ui, shared, generated
legacy elements:  legacy-lib-agents, legacy-modules, legacy-inngest,
                  legacy-trpc, legacy-app-routes, legacy-ui
```

Each legacy element is a temporary escape hatch whose `eslint.config.mjs` entry carries a `// removed by chunk NN` comment naming the chunk that retires it. Example shape:

```ts
// eslint.config.mjs (excerpt)
boundaries: {
  elements: [
    { type: "agent-domain", pattern: "src/agent/domain/**" },
    { type: "agent-application", pattern: "src/agent/application/**" },
    // ...
    // removed by chunk 03
    { type: "legacy-lib-agents", pattern: "src/lib/agents/**" },
    // removed by chunk 04
    { type: "legacy-modules", pattern: "src/modules/**" },
  ],
}
```

Rules ship at error severity. Warning mode is a fallback only if the first migration PR surfaces a real violation that cannot be cleanly suppressed by a chunk-tagged exception.

## Sequencing

1. Rebuild `docs/architecture/architecture.md` with the new top-level layout, dependency direction, folder conventions, "Where to put new code" table, CLI section naming `src/interfaces/cli` as the home for `agent:local`, migration note retiring the `src/lib`-centered architecture, and a link back to this plan folder.
2. Add `eslint-plugin-boundaries` as a dev dependency and configure it in `eslint.config.mjs` alongside the existing extends.
3. Encode the dependency graph from the architecture doc as `boundaries/element-types` rules at error severity, with element types as listed above.
4. Encode named legacy exceptions, each carrying a `// removed by chunk NN` comment that matches the chunk number in `docs/plans/open/agent-core-architecture/`.
5. Run `npm run lint` and confirm clean. If a real violation surfaces, fix it in this PR if trivial, otherwise add a chunk-tagged exception.
6. Smoke-test the rules: temporarily introduce a forbidden import (for example `src/agent/domain` importing from `src/app`), confirm lint fails with a message naming the crossed boundary, then revert before merging.
7. Update `docs/code-style/AGENTS.md` only if a human convention remains that lint cannot enforce. Default expectation: no update needed.

## Definition of done / Verification

- `docs/architecture/architecture.md` exists again and describes the new design before source files are reorganized around it.
- The architecture doc no longer points contributors to `src/lib` as the central reusable leaf layer.
- The architecture doc names the CLI as a first-class agent interface and points CLI code to `src/interfaces/cli`.
- The architecture doc links to `docs/plans/open/agent-core-architecture/` so future readers can find the migration story.
- `eslint-plugin-boundaries` is installed and configured in `eslint.config.mjs`; `npm run lint` is clean.
- Every legacy exception in the config is annotated with the chunk number that retires it, matching the chunk numbers in this plan folder.
- Boundary failures produce messages that tell contributors which layer they crossed and where the code should move; verified once via the smoke check in Sequencing step 6.

## Out of scope

- Creating any folder under `src/` (chunk 2's job).
- Moving any source files in this chunk.
- Tightening exceptions or removing legacy paths (chunks 3-5).
- Lint rules for naming conventions, file size, or non-import concerns.
- Deciding final telemetry or eval schema.
- Replacing current app or local-agent behavior.

## Conflicts checked

This chunk intentionally replaces the blanked architecture document. `agent-runtime-decoupling` is baseline work that already landed under the old layout; this chunk documents where that runtime moves next. Folder seeding is intentionally deferred to chunk 2; legacy path retirement is deferred to chunks 3-5. `agent-telemetry-refactor` and `testability-refactor` will pick up the new boundary names once chunk 2 lands.
