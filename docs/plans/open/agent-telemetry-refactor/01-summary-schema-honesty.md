# 01: Summary schema honesty

## Goal

Make the existing telemetry summary trustworthy before adding new tables or event streams.

## The problem

`src/lib/agents/telemetry.ts` calculates more information than the database stores. `TelemetryPayload` includes planner task type, attempt count, final escalated model, and verification counts, but `toPersistedTelemetry` drops them because `prisma/schema.prisma` has no matching columns.

The row also has `createdAt` but no `updatedAt`, even though the code upserts it during step snapshots and again at final persistence.

## What "after" looks like

Add the already-calculated fields to the persisted shape:

```prisma
model Telemetry {
  id                       String   @id @default(uuid())
  messageId                String   @unique
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
  updatedAt                DateTime @updatedAt
}
```

Rename the TypeScript concept if it clarifies intent:

```ts
type RunTelemetrySummary = PersistedTelemetry & {
  plannerTaskType: string | null;
  totalAttempts: number;
  escalatedTo: string | null;
  verificationSuccessCount: number;
  verificationFailureCount: number;
};
```

## Sequencing

1. Add Prisma columns and migration.
2. Update `PersistedTelemetry`, `TelemetryPayload` or renamed summary type, and `TelemetryStore`.
3. Update `toPersistedTelemetry` so no calculated summary fields are dropped.
4. Update telemetry tests to assert the full persisted shape.

## Definition of done / verification

- `npm test -- src/lib/agents/telemetry.test.ts` covers the full persisted payload.
- Prisma migration includes every field already calculated by `buildTelemetry`.
- The telemetry row's `updatedAt` changes on later upserts.

## Out of scope

- Attempt, step, or verification detail tables.
- New telemetry fields that require changing executor behavior.
- UI/dashboard work.

## Conflicts checked

Overlaps with the `testability-refactor` telemetry persistence chunks, but this chunk is limited to schema/type honesty and can land before deeper callback or repository extraction.
