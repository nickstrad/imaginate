# Observability data planes

## Goal

Make every interesting fact about an agent run land in exactly one place — and make all three places queryable, with sensible per-environment backends. Today the codebase has three loosely related stores (Postgres OLTP, the `Telemetry` summary row, and stdout logs); they overlap at random, miss the data we actually need to debug failures (e.g. "why did the executor escalate"), and have no analytical query path. This plan defines the contract between the three planes, introduces a wide append-only `RunEvent` store with environment-specific adapters (Postgres-JSONB for the prod web app, DuckDB+Parquet for local CLI agent dev), and audits every existing log site so `LOG_LEVEL=debug` actually surfaces every fact a human or future analytics query might want.

## The three data planes

| Plane           | Backed by                                      | Audience                             | Optimized for                                                   | Lifetime               |
| --------------- | ---------------------------------------------- | ------------------------------------ | --------------------------------------------------------------- | ---------------------- |
| **Operational** | Postgres (`Project`, `Message`, `Fragment`, …) | The product (UI, tRPC, app behavior) | Read/write the user's product state                             | Forever                |
| **Analytical**  | `RunEvent` store (PG-JSONB or DuckDB/Parquet)  | AI / occasional human                | Wide append-only events; group-by/percentile queries off-system | Bounded retention      |
| **Logs**        | Stdout via `@/platform/log`                    | Human (you) triaging a single run    | Live debugging at the level the operator chose                  | Whatever ships ingests |

Rules — one-directional, not symmetric:

- **Operational stays minimal.** It carries only what the running app needs to behave correctly: project, message, fragment, telemetry summary used by the UI. Diagnostic state ("why did attempt 2 escalate", "what was the matched stub-language window") never lives here. If a feature only exists to debug or analyze, it does not belong in Operational.
- **Analytical is wide and may duplicate Operational.** The event store is the queryable record of "what actually happened during this run". It is allowed — encouraged — to copy operational facts into the row when they are useful to query alongside diagnostics: the user prompt, key parts of assistant thoughts, tool-call names and args, commands run, file paths written. The duplication is intentional: analysis should not require joining back to the OLTP DB to reconstruct context, and the OLTP row may not exist (e.g. CLI runs with no Postgres).
- **Logs overlap freely; level controls volume, not completeness.** The event store is always written in full. Logs are the human view of the same stream:
  - `debug` shows everything (full payloads, per-step text, per-tool args/results, planner I/O).
  - `info` shows lifecycle (run started, attempt accepted, run finished).
  - `warn` shows things a human probably wants to see live (escalation reasons, stub-language matches).
  - `error` shows failures.
    Each level up strips detail; nothing is ever stripped from the analytical store.
- **Shared vocabulary.** Logs and analytical events use the same `(scope, event)` names and field names so grep and SQL look the same.

## Backend choice (Analytical plane)

Two adapters behind one port:

- **PG-JSONB** — default for the deployed web app. Cheap, already operational, joins to `Message`/`Project` for free, query-able with `SELECT … WHERE payload->>'reason' = 'stub_language'`. Good enough until volume forces a column store.
- **DuckDB + Parquet** — default for the local CLI agent (`npm run agent:local`). Each run appends to `~/.imaginate/events/YYYY-MM-DD.parquet`. DuckDB queries the parquet glob directly:

  ```sql
  SELECT scope, event, payload->>'reason' AS reason, count(*)
  FROM '~/.imaginate/events/*.parquet'
  WHERE scope = 'agent.executor' AND event = 'attempt.escalated'
  GROUP BY 1, 2, 3;
  ```

  Same schema as the PG row, just file-resident. No ops cost. The CLI ships a `npm run agent:events` subcommand that wraps DuckDB.

The port is the same shape for both (`EventStore.append(events: RunEvent[])`), so transports never see the backend.

ClickHouse / external warehouse are explicitly **out of scope** here. Either backend can be replaced later by adding one adapter; the port is what matters.

## What "after" looks like

A wide event row, append-only. The payload is intentionally fat — copy operational context that helps the row be self-describing:

```ts
type RunEvent = {
  // routing & identity
  eventId: string; // ulid
  occurredAt: Date;
  turnKey: string; // joins to Message in PG, joins to itself in DuckDB
  runId: string; // unique per runAgent invocation (same as turnKey for now)
  projectId: string | null;
  transport: "web" | "cli" | "slack";

  // taxonomy
  scope:
    | "agent.planner"
    | "agent.executor"
    | "agent.tool"
    | "agent.run"
    | "agent.sandbox";
  event: string; // pinned vocabulary, e.g. "attempt.failed", "step.finished"
  level: "debug" | "info" | "warn" | "error";

  // payload — wide; mixes operational and analytical fields
  payload: Record<string, unknown>;
};
```

Examples of what payloads look like — note the operational duplication is intentional:

```jsonc
// agent.run.started
{ "userPrompt": "build a kanban board", "plannerModel": "anthropic:claude-sonnet-4-6" }

// agent.tool.call.finished
{ "toolName": "writeFile", "args": { "path": "src/Board.tsx", "bytes": 4321 }, "ok": true, "durationMs": 87 }

// agent.executor.step.finished
{ "stepIndex": 1, "finishReason": "stop", "text": "<full assistant text>", "toolCallNames": ["readFile","writeFile"] }

// agent.executor.attempt.escalated
{ "attempt": 1, "model": "lmstudio:qwen/qwen3-coder-next", "reason": "stub_language",
  "stubMatch": { "term": "todo", "offset": 412, "window": "...consistent spacing TODO add tests..." } }
```

Emission points (pinned vocabulary, every one of these MUST fire):

```
agent.run.started           agent.run.finished           agent.run.failed
agent.planner.started       agent.planner.finished
agent.executor.attempt.started   agent.executor.attempt.finished
agent.executor.attempt.failed    agent.executor.attempt.escalated
agent.executor.step.finished     agent.executor.ladder.exhausted
agent.tool.call.started     agent.tool.call.finished
agent.sandbox.created       agent.sandbox.preview_ready
agent.stub_language.matched (when escalation reason is stub_language)
```

Stdout reads as a curated debug feed for the human running the agent; the event store reads as a queryable analytical record for whatever (or whoever) wants to ask questions later. They overlap by design: every analytical event has the option to mirror to stdout. Levels control which mirrors fire:

- `error` / `warn` — always logged, regardless of `LOG_LEVEL` (within reason); these are the things a human needs to see now.
- `info` — logged at `LOG_LEVEL=info` or lower; lifecycle markers (run started, run finished, attempt accepted).
- `debug` — logged at `LOG_LEVEL=debug`; the full payload of every analytical event (per-step text, per-tool-call args/result, planner I/O, ladder evaluation).

A `LOG_LEVEL=warn` run still appends every event to the analytical plane — the level only controls how loud stdout is. That is what lets the analytical store stay complete while logs stay readable.

Per-environment composition:

```ts
// src/interfaces/inngest/agent-adapter.ts
const eventStore = createPgEventStore({ prisma });

// src/interfaces/cli/agent-local.ts
const eventStore =
  process.env.IMAGINATE_EVENT_STORE === "pg"
    ? createPgEventStore({ prisma })
    : createDuckdbEventStore({ dir: defaultEventDir() });
```

## Sequencing

The plan is ordered. Detail decays past the next chunk; later chunks are one-line bullets here and only get a real file when promoted.

1. **`01-event-port-and-vocabulary.md`** — Define the `EventStore` port (`src/agent/ports/event-store.ts`), the `RunEvent` type (in `src/agent/domain/events.ts` alongside the existing runtime event union), and the pinned scope/event vocabulary. Wire emission at every harness lifecycle point (planner start/finish, executor attempt start/finish/escalated/failed, step finished, tool call start/finish, run finished/failed, sandbox created/ready). Replace today's ad-hoc `log.warn({ event: "executor escalated" })` calls in `src/interfaces/inngest/functions.ts` with `eventStore.append(...)` + a structured `log.debug` mirror at the same call site so logs and events stay in lockstep. **Full detail.**

2. **`02-pg-event-store-adapter.md`** — Default backend: a single `RunEvent` table in `prisma/schema.prisma`, JSONB payload, indexed on `(turnKey, occurredAt)` and `(scope, event)`. Adapter under `src/agent/adapters/prisma/event-store.ts`. tRPC route `runEvents.byTurn(turnKey)` for the UI to render a timeline. Light detail until promoted.

3. **`03-duckdb-parquet-adapter.md`** — CLI-default backend. Adapter under `src/agent/adapters/duckdb/event-store.ts`. Writes to `~/.imaginate/events/YYYY-MM-DD.parquet`, batched per run (one file write at run end, not per event). New `src/interfaces/cli/agent-events.ts` subcommand wraps DuckDB queries. Light detail until promoted.

4. **`04-leveled-logging-audit.md`** — Audit every `log.info` / `log.warn` site in `src/agent`, `src/interfaces`, and `src/features` against the new vocabulary. Add `log.debug` for: every step's full thought text (no 2000-char cap), per-tool-call args/result, planner LLM input/output, ladder slot evaluation. Document `LOG_LEVEL=debug` as the default for local CLI dev. Light detail until promoted.

5. **`05-event-query-surface.md`** — One-liner: `npm run agent:events -- --turn <id>` (DuckDB) and tRPC `runEvents.byTurn` (PG). Promote when 04 ships.

6. **`06-drop-telemetry-table.md`** — One-liner: drop the `Telemetry` Prisma model, its FK on `Message`, and the `prisma-message-repository` writes. Confirm zero callers in `src/features/`, `src/app/`, `src/interfaces/trpc/` before the migration. Promote once `RunEvent` is in PG (chunk 02 shipped) and any rollup the UI needs has been redefined as a query against `RunEvent`.

## Definition of done

- Every emission point in the vocabulary above fires at least one `RunEvent` per harness invocation, in both web and CLI transports.
- A failing run produces enough events to reconstruct _why_ without reading stdout (e.g. `stub_language` escalation includes the matched term + window in payload).
- `LOG_LEVEL=debug` produces a stdout stream whose `event` field exactly matches the analytical event vocabulary (same names, same payload keys).
- Backends are swappable via env (`IMAGINATE_EVENT_STORE=pg|duckdb`), and an integration test exercises both adapters against the same fake harness run.
- No diagnostic state lives in Operational tables (`Message`, `Fragment`) that exists only to be queried later. Such state moves to `RunEvent`. The reverse is allowed: `RunEvent` may duplicate operational fields (prompt, tool args, commands, parts of assistant text) when those make the row self-describing for analysis.
- The `Telemetry` table is gone (chunk 06). Any UI need for run-level totals is satisfied by a query against `RunEvent`.
- `docs/architecture/architecture.md` "Where to put new code" gains a row for "An analytical event the harness emits" → `agent/domain/events.ts` + `agent/ports/event-store.ts`. Updated in chunk 01.

## Out of scope

- ClickHouse, BigQuery, or any external warehouse — adapter only, future plan.
- Log shipping infrastructure (Vector, Fluent Bit). Stdout stays stdout.
- Replacing `Telemetry` summary row. The summary refactor is owned by `agent-telemetry-refactor`; this plan only ensures fields that don't belong in the summary land in `RunEvent` instead.
- Per-tool-call full-result archival (potentially huge). Tool results stay truncated in events; full bodies stay in stdout `debug` for now.
- Redacting secrets from event payloads. Tracked separately when the event store starts persisting prompts.

## Dependencies & conflicts

- **Depends on `agent-harness-transport-agnostic/`.** Needs `runAgent` to expose ladder hooks (`onAttemptStart`, `onAttemptFinish`, `onEscalate`, `onStepFinish`, `onRunFinished`) so emission lives in one place instead of being re-implemented per transport. Also needs the structured `AgentError { code, category, retryable }` for `attempt.failed` payloads.
- **Supersedes `agent-telemetry-refactor/`.** That plan widened the `Telemetry` Postgres table to capture diagnostic dimensions (planner/executor identity, escalation reason, error category, run duration). Audit of `src/features/`, `src/app/`, and `src/interfaces/trpc/` shows nothing reads `Telemetry` — it is analytical state masquerading as operational. The wide `RunEvent` store covers the same surface and more, with the right backend split for prod vs. local. The superseded plan folder has been removed; this plan inherits its goal of "useful feedback loop for improving the harness" and adds `03-drop-telemetry-table` to retire the table once `RunEvent` is live.
- **Coordinates with `cli-ink-app/`.** The CLI agent will be the primary consumer of the DuckDB backend. The Ink app can render an event timeline from the same store; coordinate the query shape in chunk 02 so both UIs read the same rows.
- **No conflict with `cli-local-sandbox.md`, `cli-git-tools.md`, `planner-complexity-routing.md`** — these touch different surfaces.
- **No conflict with the drift plan in `drift/`** — drift README is empty / generated only.
