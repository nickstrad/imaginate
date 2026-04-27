# 03: Attempt, step, and verification records

## Goal

Add compact append-only detail records after the summary row is stable.

The point is to explain why a run succeeded, failed, or escalated without storing raw prompts, reasoning text, full outputs, or file contents.

## The problem

The current single-row upsert loses intermediate history. Step snapshots are useful during the run, but later analysis only sees the final aggregate counts.

That means the harness cannot easily answer:

- Which executor attempt failed?
- Which model rung succeeded?
- Which step called which tools?
- Did verification fail because build, test, or lint failed?
- How much time and token budget did each attempt or step consume?

## What "after" looks like

Keep `Telemetry` or `TelemetrySummary` as the current-state summary. Add detail rows linked by `messageId` or a future `runId`:

```prisma
model AgentAttemptTelemetry {
  id                    String   @id @default(uuid())
  messageId             String
  attemptIndex          Int
  provider              String
  model                 String
  status                String
  escalationReason      String?
  providerErrorCategory String?
  promptTokens          Int?
  completionTokens      Int?
  totalTokens           Int?
  durationMs            Int?
  createdAt             DateTime @default(now())
}

model AgentStepTelemetry {
  id               String   @id @default(uuid())
  messageId        String
  attemptIndex     Int
  stepNumber       Int
  finishReason     String?
  toolNames        Json
  promptTokens     Int?
  completionTokens Int?
  totalTokens      Int?
  textLength       Int?
  durationMs       Int?
  createdAt        DateTime @default(now())
}

model AgentVerificationTelemetry {
  id                    String   @id @default(uuid())
  messageId             String
  attemptIndex          Int?
  kind                  String
  command               String
  success               Boolean
  exitCode              Int?
  durationMs            Int?
  stdoutTruncated       Boolean
  stderrTruncated       Boolean
  createdAt             DateTime @default(now())
}
```

The exact names can change during implementation. The important shape is one summary row plus append-only compact records.

## Sequencing

1. Add attempt-level records first because they explain model ladder behavior.
2. Add verification records next because they explain correctness confidence.
3. Add step records once the `onStepFinish` callback is split enough to capture compact metadata cleanly.
4. Add duration capture around tool and verification paths where timing is already centralized.

## Definition of done / verification

- A multi-attempt run produces one row per attempt.
- Verification commands are queryable by kind, command, success, and exit code.
- Step records include tool names and usage metadata without storing full step text.
- Tests cover at least one escalated run and one verification-failure run.

## Out of scope

- Raw event replay.
- Full trace storage.
- Dashboard UI.
- Object-storage mirroring.

## Conflicts checked

The `onStepFinish` tangle in `src/interfaces/inngest/functions.ts` is the main risk: step metadata should be captured in `src/agent/application` (the use cases that already produce runtime events) and persisted via the `TelemetryStore` port, not by deepening the Inngest callback. No conflicts with currently-open plans.
