# 02 — Postgres event store adapter

## Goal

Make the deployed web app actually persist `RunEvent`s. Add a single `RunEvent` table to `prisma/schema.prisma` with a JSONB `payload`, write a Prisma-backed adapter, and swap the production default from `noopEventStore` (chunk 01) to the new adapter inside `src/interfaces/inngest/agent-adapter.ts`. CLI keeps `noopEventStore` as the default until chunk 03 ships the DuckDB backend.

## What changes and why

- New Prisma model `RunEvent`. Columns: `eventId` (PK, ulid string), `occurredAt`, `turnKey`, `runId`, `projectId`, `transport`, `scope`, `event`, `level`, `payload Jsonb`, `createdAt`. Indexes: `(turnKey, occurredAt)` for timeline reads, `(scope, event, occurredAt)` for analytics group-bys.
- No FK to `Message`. `turnKey` is opaque; the join happens query-side. This keeps the harness contract free of web-specific identity (`agent-harness-transport-agnostic` invariant).
- Adapter: `src/agent/adapters/prisma/event-store.ts`. Implements `EventStore.append` as a single `createMany` call. Batches per-turn at the call site by buffering events in the emitter and flushing on `agent.run.finished` / `agent.run.failed` so a turn writes one row group, not N round-trips.
- A tRPC route `runEvents.byTurn(turnKey)` returns the timeline ordered by `occurredAt` for the UI to render. Owned by `src/interfaces/trpc/`.

## What it depends on

- Chunk 01 shipped — port and vocabulary exist.
- The inngest function reads `turnKey` from a stable place. Today that's `messageId`; this chunk codifies "turnKey = messageId in the web transport" inside `src/interfaces/inngest/agent-adapter.ts`, not the harness.

## Rough shape

```prisma
model RunEvent {
  eventId    String   @id
  occurredAt DateTime
  turnKey    String
  runId      String
  projectId  String?
  transport  String
  scope      String
  event      String
  level      String
  payload    Json
  createdAt  DateTime @default(now())

  @@index([turnKey, occurredAt])
  @@index([scope, event, occurredAt])
}
```

Promote to full detail when 01 is in main.
