# Architecture

This document is the contract for `src/`. It names the layers, fixes the direction of imports between them, and tells contributors where new code goes. It is enforced where possible by `eslint-plugin-boundaries` in `eslint.config.mjs`.

This file is a contract, not a changelog. Normal feature PRs conform to it. Architecture-changing PRs must be planned first (see `docs/plans/AGENTS.md`) and update this document and the lint rules in the same change set.

## Top-level layout

```txt
src/
  app/          Next.js App Router routes, layouts, route handlers
  interfaces/   Delivery mechanisms: tRPC, Inngest, CLI/scripts, HTTP adapters
  agent/        First-class reusable agent runtime
  features/     Product workflows and UI-facing feature composition
  platform/     Concrete infrastructure adapters shared across runtimes
  ui/           Cross-feature presentation primitives and hooks
  shared/       Small framework-neutral utilities, schemas, test support
  generated/    Generated clients; never edited directly
```

`src/agent` is itself layered:

```txt
src/agent/
  domain/        Pure state, decisions, verification, edits, schemas, types, runtime event contract
  application/   Planner/executor use cases and runtime event production
  ports/         Model, sandbox, message, telemetry, filesystem, logging boundaries
  adapters/      AI SDK, E2B, Prisma, local workspace, memory, terminal bindings
  testing/       Fakes and in-memory implementations for tests
  index.ts
```

## Direction of dependencies

Arrows mean "is allowed to import from". Same-layer imports are always allowed; the entries below describe cross-layer permissions only. Anything not listed is forbidden.

```txt
app                -> interfaces, features, ui, shared, generated
interfaces         -> agent (application + adapters + ports), features, platform, ui, shared, generated
features           -> agent (application + ports), platform, ui, shared, generated
agent/adapters     -> agent/ports, agent/domain, platform, shared, generated
agent/application  -> agent/domain, agent/ports, shared
agent/domain       -> shared
agent/ports        -> agent/domain, shared
agent/testing      -> agent/domain, agent/ports, agent/application, shared
platform           -> shared, generated
ui                 -> shared
shared             -> (none)
generated          -> (no internal imports; consumed by adapters/platform only)
```

Key invariants:

- `agent/domain` is pure. It must not import Next, React, tRPC, Inngest, Prisma, E2B, the AI SDK, or any concrete adapter.
- `agent/application` orchestrates the runtime through ports. It must not reach into `agent/adapters` or any concrete SDK.
- `platform/**` is concrete infrastructure (clients, persistence, queues). It depends only on `shared`.
- `features/**` composes product workflows. It must not import `interfaces` or `app`.
- `app/**` should not import `agent/adapters/**` directly. Composition belongs in interface adapters.

## Folder conventions

### `src/agent`

- `domain/` — pure functions, types, schemas, and the runtime event type contract (`events.ts`). No I/O. Tests run with no mocks. Event types live here (not in `application/`) so `ports/event-sink.ts` can reference them without crossing the `ports → application` boundary.
- `application/` — use cases (`runAgent`, `planRun`, `executeRun`) that take a `deps` object of ports. They produce events of the types declared in `domain/events.ts` and emit them through the event sink port; they do not write to Prisma or the network directly.
- `ports/` — interface declarations. One file per port (`model-gateway.ts`, `sandbox-gateway.ts`, `message-store.ts`, `telemetry-store.ts`, `event-sink.ts`, `logger.ts`, …). Ports import only from `agent/domain` and `shared`.
- `adapters/` — concrete bindings, one folder per integration (`ai-sdk/`, `e2b/`, `prisma/`, `local-workspace/`, `memory/`, `terminal/`). Each folder exports a factory.
- `testing/` — fakes and in-memory implementations used by tests. Not imported from production paths.
- Public surface: `src/agent/index.ts` re-exports application use cases, port types, the runtime event types from `domain/events.ts`, and named adapter factories. Consumers import from `@/agent`, not from deep paths — the internal layering (`domain` / `application` / `ports` / `adapters`) is an implementation detail.

### `src/interfaces`

- One subfolder per delivery mechanism: `trpc/`, `inngest/`, `cli/`, plus future HTTP/webhook adapters.
- Each interface composes agent dependencies and calls into `@/agent` and `@/features`.
- `interfaces/cli/` is the home for `npm run agent:local`; see "CLI as a first-class interface" below.

### `src/features`

- One folder per product domain (`projects/`, `messages/`, `providers/`, …).
- Inside each feature, sub-layers: `application/` (workflow functions), `adapters/` (feature-scoped infrastructure, e.g. repositories), `presentation/` (components and views).
- Features call the agent through `@/agent`; the agent never calls features.

### `src/platform`

- Concrete infrastructure that is not agent-specific: shared Prisma client, logging, queue clients, rate limiters, sandbox provider clients used outside the agent.
- Imports only `shared`. If a platform module needs a domain type, the type lives in `shared` or is duplicated narrowly.

### `src/shared`

- Framework-neutral utilities: schemas, branded types, small helpers, test scaffolding usable by any layer.
- No imports from any other `src/` layer.

## Where to put new code

| New code is …                                              | Lives in                                       |
| ---------------------------------------------------------- | ---------------------------------------------- |
| A pure rule, schema, or state transition for the agent     | `src/agent/domain/`                            |
| A new runtime event type or payload field                  | `src/agent/domain/events.ts`                   |
| A planner/executor use case (emitting existing events)     | `src/agent/application/`                       |
| A new external dependency the agent needs (SDK, store, …)  | New port in `src/agent/ports/` + adapter under |
|                                                            | `src/agent/adapters/<integration>/`            |
| A fake/in-memory implementation for tests                  | `src/agent/testing/`                           |
| A tRPC procedure                                           | `src/interfaces/trpc/`                         |
| An Inngest function or event handler                       | `src/interfaces/inngest/`                      |
| A CLI command or script entrypoint                         | `src/interfaces/cli/`                          |
| Product workflow that orchestrates agent + persistence     | `src/features/<domain>/application/`           |
| A repository or feature-scoped infra                       | `src/features/<domain>/adapters/`              |
| A feature-specific React component or view                 | `src/features/<domain>/presentation/`          |
| Shared UI primitives (buttons, dialogs, hooks)             | `src/ui/`                                      |
| Concrete shared infra (Prisma client, logger, rate limits) | `src/platform/`                                |
| A schema, branded type, or pure helper used anywhere       | `src/shared/`                                  |
| A Next.js route, layout, or route handler                  | `src/app/`                                     |
| Generated code (Prisma, OpenAPI clients, …)                | `src/generated/` (never hand-edited)           |

If a new responsibility doesn't fit, propose an addition through a plan in `docs/plans/open/`. Do not invent a new top-level folder unilaterally.

## CLI as a first-class interface

`npm run agent:local` is a supported delivery mechanism, not a dev-only script. It exists so agent changes can be developed, debugged, and iterated without booting the Next dev server, the tRPC route, or the Inngest dev server.

- Code lives under `src/interfaces/cli/`.
- The CLI composes `@/agent` use cases with adapters appropriate for local execution (production model adapters, local workspace or in-memory stores, terminal event sink).
- The CLI must keep parity with the web/Inngest path on the runtime contract: runtime events, final output, verification rows, files written, token usage, sandbox URL, follow-up command.
- Argument parsing, output formatting, and follow-up command generation belong in CLI-owned helpers, not in `@/agent`.

## Lint enforcement

Import direction is enforced by `eslint-plugin-boundaries` in `eslint.config.mjs`. The plugin declares an element type per layer (`app`, `interfaces`, `agent-domain`, `agent-application`, `agent-ports`, `agent-adapters`, `agent-testing`, `features`, `platform`, `ui`, `shared`, `generated`) and a dependency matrix that mirrors the graph above.
