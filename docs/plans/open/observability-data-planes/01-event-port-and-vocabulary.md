# 01 — Event port and pinned vocabulary

## Goal

Stand up the `EventStore` port and the `RunEvent` type, pin a vocabulary of `(scope, event)` tuples that every harness invocation MUST emit, and refit the existing inngest function and CLI to emit them through the port. Backends in this chunk: an in-memory adapter for tests and a no-op adapter as the production default until chunk 02 wires Postgres. Logs stay where they are but every new emission site also emits a `log.debug` with the same vocabulary so logs and events do not drift.

## The problem

Today the harness signals "something interesting happened" three different ways:

- `eventSink.emit({ type: "executor.attempt.failed", … })` — runtime events for in-process consumers (UI thoughts, terminal sink). Not persisted, not queryable.
- `log.warn({ event: "executor escalated", metadata: { reason } })` — stdout only. Lost as soon as Inngest rotates.
- `Telemetry` row in Postgres — a single summary row, written once at the end. No per-attempt or per-step detail.

Concrete pain (`file:line`):

- `src/interfaces/inngest/functions.ts:264-275` (executor attempt failed) and `:316-339` (executor escalated) — two log calls and two eventSink emits, manually kept in sync.
- `src/interfaces/inngest/functions.ts:316-355` (stub-language match) — diagnostic only goes to stdout. Tomorrow's question "how often does qwen3-coder-next escalate via stub_language" is unanswerable.
- `src/agent/application/execute-run.ts:217-228` (agent step) — truncated step text in a log; full text is nowhere queryable.
- The CLI (`src/interfaces/cli/agent-local.ts`) re-derives the same diagnostics from the runtime event sink because there is no shared persistence path.

## What "after" looks like

A new domain type alongside `RunState` events:

```ts
// src/agent/domain/events.ts (additions)
export type RunEventScope =
  | "agent.run"
  | "agent.planner"
  | "agent.executor"
  | "agent.tool"
  | "agent.sandbox";

export type RunEventName =
  | "started"
  | "finished"
  | "failed"
  | "attempt.started"
  | "attempt.finished"
  | "attempt.failed"
  | "attempt.escalated"
  | "step.finished"
  | "ladder.exhausted"
  | "call.started"
  | "call.finished"
  | "stub_language.matched"
  | "preview_ready"
  | "created";

export interface RunEvent {
  eventId: string;
  occurredAt: string; // ISO
  turnKey: string;
  runId: string;
  projectId: string | null;
  transport: "web" | "cli" | "slack";
  scope: RunEventScope;
  event: RunEventName;
  level: "debug" | "info" | "warn" | "error";
  payload: Record<string, unknown>;
}
```

A new port, one file per "Where to put new code" architecture rule:

```ts
// src/agent/ports/event-store.ts
import type { RunEvent } from "@/agent/domain/events";

export interface EventStore {
  append(events: RunEvent[]): Promise<void>;
}
```

A factory helper that the harness uses internally so call sites stay terse:

```ts
// src/agent/application/run-events.ts
export function makeRunEventEmitter(args: {
  store: EventStore;
  log: Logger;
  context: {
    turnKey: string;
    runId: string;
    projectId: string | null;
    transport: RunEvent["transport"];
  };
}) {
  return async function emit(input: {
    scope: RunEvent["scope"];
    event: RunEvent["event"];
    level?: RunEvent["level"];
    payload?: Record<string, unknown>;
  }) {
    const ev: RunEvent = {
      eventId: ulid(),
      occurredAt: new Date().toISOString(),
      ...args.context,
      level: input.level ?? "info",
      payload: input.payload ?? {},
      scope: input.scope,
      event: input.event,
    };
    args.log[ev.level]({
      event: `${ev.scope}.${ev.event}`,
      metadata: ev.payload,
    });
    await args.store.append([ev]);
  };
}
```

Every emission site in `src/interfaces/inngest/functions.ts` becomes one call:

```ts
await emit({
  scope: "agent.executor",
  event: "attempt.escalated",
  level: "warn",
  payload: { attempt: i + 1, model: descriptorString, reason: outcome.reason },
});
```

The existing `log.warn({ event: "executor escalated", … })` line is **deleted** from that site — the emitter writes both.

In-memory adapter for tests:

```ts
// src/agent/adapters/memory/event-store.ts
export function createMemoryEventStore(): EventStore & { events: RunEvent[] } { … }
```

No-op adapter as production default until chunk 02 wires Postgres:

```ts
// src/agent/adapters/memory/noop-event-store.ts
export const noopEventStore: EventStore = { append: async () => {} };
```

## Sequencing

Inside this chunk:

1. **Add types and port.** `src/agent/domain/events.ts` (extend), `src/agent/ports/event-store.ts` (new). Update `src/agent/index.ts` re-exports.
2. **Add the emitter factory.** `src/agent/application/run-events.ts` (new). Pure function, no I/O beyond what's injected.
3. **Add the in-memory and noop adapters.** `src/agent/adapters/memory/event-store.ts`, `src/agent/adapters/memory/noop-event-store.ts`.
4. **Wire the inngest function.** `src/interfaces/inngest/functions.ts`: build `emit` once at the top, replace every existing log+eventSink pair at planner/executor/run/sandbox lifecycle points with one `emit` call. Keep the existing `eventSink` (it drives UI thoughts) — events and runtime events are separate concerns. Delete the now-redundant `log.warn` lines whose information is fully captured by the event payload.
5. **Wire the CLI.** `src/interfaces/cli/agent-local.ts`: same emitter, noop adapter by default. CLI continues to print runtime events for human reading.
6. **Tests.** A new test under `src/agent/testing/` runs a fake `runAgent` against the in-memory store and asserts every entry in the pinned vocabulary fires at least once on a happy path, and that `attempt.failed` / `attempt.escalated` / `ladder.exhausted` fire on the corresponding failure paths.
7. **Architecture doc update.** Add a row to the "Where to put new code" table:

   | New code is …                            | Lives in                                                        |
   | ---------------------------------------- | --------------------------------------------------------------- |
   | A new analytical event the harness emits | `src/agent/domain/events.ts` + `src/agent/ports/event-store.ts` |

## Definition of done

- Every name in the pinned vocabulary above fires from `runAgent` on its respective code path. Verified by the new test running both happy and failure paths against the in-memory store.
- `src/interfaces/inngest/functions.ts` has zero ad-hoc `log.warn({ event: "executor …" })` calls; all such lines route through the emitter.
- The emitter writes to the analytical store unconditionally and writes to `log` at the level passed in (`debug` for hot per-step events, `info` for lifecycle, `warn` for escalations, `error` for run failure). `LOG_LEVEL=warn` keeps stdout terse but the analytical store stays complete; `LOG_LEVEL=debug` reproduces the full `(scope, event)` vocabulary on stdout for live triage. Logs overlap the analytical plane on purpose — they are the human view, not a duplicate of the record.
- Production default is `noopEventStore`; nothing is persisted yet. Chunk 02 swaps it for the PG adapter.
- `npm test` and `eslint` clean. New imports respect direction: emitter and port live in `agent/application` + `agent/ports`; adapters in `agent/adapters/memory`. No `agent/*` file imports `interfaces/*` or `platform/*` outside the existing exception.

## Out of scope

- Persistence backend (chunk 02 / 03).
- Dropping the `Telemetry` table or removing its writes — that is chunk 06 of this plan. This chunk leaves the table and its writes alone; `RunEvent` is purely additive.
- Sampling, batching, or back-pressure on the emitter — `noopEventStore` makes them irrelevant for now and the PG adapter in chunk 02 will batch per turn.
- Renaming or restructuring the existing runtime `eventSink`. They serve different consumers (UI thoughts vs. analytical events) and stay separate.

## Dependencies & conflicts

- **Depends on `agent-harness-transport-agnostic/`** chunk 4 (`extract-execute-with-ladder`) — emitter calls live cleanly inside `executeWithLadder`'s hooks. Until that lands, this chunk falls back to wiring the emitter at the inngest function body, accepting the duplication that the harness plan will collapse.
