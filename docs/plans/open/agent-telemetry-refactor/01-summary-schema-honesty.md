# 01: Summary schema honesty

**Prereq:** `agent-harness-transport-agnostic/` is shipped. `runAgent` returns a frozen `RunState`, errors are `AgentError`, and `TelemetryStore` is keyed by `turnKey`.

## Goal

Persist the full summary the runtime now exposes. Switch the port and column from `messageId` to `turnKey` (web adapter maps `turnKey → messageId` for its own FK). Add indexes the analysis chunk needs. Replace the old per-step upsert path with a single end-of-run write.

## The problem

After the harness refactor, `runAgent` produces a `RunState` and an `AgentRunResult` rich enough to assemble the full summary in one pass. The Postgres `Telemetry` table still mirrors the old narrow shape and is keyed on `messageId`, which is no longer a harness concept.

## What "after" looks like

```ts
// src/agent/domain/telemetry.ts
export function summarizeRun(args: {
  runState: Readonly<RunState>;
  result: AgentRunResult;
  startedAt: Date;
  finishedAt: Date;
}): RunTelemetrySummary;
```

```ts
// src/agent/ports/telemetry-store.ts
upsert(args: { turnKey: string; summary: RunTelemetrySummary }): Promise<void>;
```

Web schema (note: `messageId` FK and unique constraint stay; the _port_ is `turnKey`. The Prisma adapter looks up `messageId` from the `turnKey` it owns):

```prisma
model Telemetry {
  id                       String   @id @default(uuid())
  messageId                String   @unique               // adapter-resolved from turnKey
  message                  Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)

  steps                    Int
  filesRead                Int
  filesWritten             Int
  commandsRun              Int
  buildSucceeded           Boolean
  promptTokens             Int?
  completionTokens         Int?
  totalTokens              Int?

  plannerTaskType          String?
  totalAttempts            Int
  escalatedTo              String?
  verificationSuccessCount Int
  verificationFailureCount Int

  createdAt                DateTime @default(now())

  @@index([plannerTaskType])
  @@index([escalatedTo])
  @@index([createdAt])
}
```

`updatedAt` is **not** added: post-refactor, a summary row is written exactly once. If a transport wants per-step progress visibility, it does that with its own table or via the harness's `onStepFinish` hook — not by mutating the summary row.

## Sequencing

1. Implement `summarizeRun` in `src/agent/domain/telemetry.ts` as a pure function over `RunState` + `AgentRunResult` + timing. Delete the old mutation-driven `buildTelemetry` and `toPersistedTelemetry`.
2. Update the `TelemetryStore` port and Prisma adapter to take `{ turnKey, summary }`. The Prisma adapter resolves `turnKey → messageId` (Inngest writes the Message row before invoking the harness; the mapping is its own concern).
3. Add Prisma columns + indexes + migration.
4. Wire telemetry assembly into Inngest's `onAttemptFinish` / final-outcome hook. Single write per run.
5. Remove any remaining per-step telemetry calls (they should already be gone after the harness refactor's chunk 4).
6. Update telemetry tests to assert the full persisted shape and the `turnKey → messageId` mapping in the adapter.

## Definition of done / verification

- `npm test -- src/agent/domain/telemetry.test.ts` covers the full summary as a pure function.
- Prisma migration includes every field already calculated by `summarizeRun` plus the three indexes.
- Exactly one telemetry write per run; no per-step upserts remain.
- Adapter test proves `turnKey → messageId` resolution and rejects unknown `turnKey` clearly.

## Out of scope

- Outcome/model dimensions (chunk 2).
- Attempt or verification detail tables (chunk 4).
- New runtime fields beyond what the harness already exposes after its refactor.
- UI/dashboard work.

## Conflicts checked

No conflicts in current `open/` or `drift/`. Limited to schema/type honesty and port rekeying. Depends on `agent-harness-transport-agnostic/`.
