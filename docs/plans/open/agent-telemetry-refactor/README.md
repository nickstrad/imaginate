# Agent telemetry refactor

Status: not started.

## Goal

Turn the current agent telemetry summary into a useful feedback loop for improving the harness over time. The end state should preserve a compact summary row for app/runtime queries, add structured detail where it answers real questions, and avoid collecting raw content or large blobs by default.

This plan keeps PostgreSQL as the primary store for now. Object storage can be added later for optional JSONL trace archives if usage, retention, or offline analytics needs justify it.

## The problem

Current telemetry is a useful seed, but it is not yet a useful analysis substrate.

- `src/agent/domain/telemetry.ts` builds a richer `TelemetryPayload` than `prisma/schema.prisma` persists. Fields such as `plannerTaskType`, `totalAttempts`, `escalatedTo`, `verificationSuccessCount`, and `verificationFailureCount` are calculated and then dropped.
- `src/interfaces/inngest/functions.ts` writes step snapshots during `onStepFinish`, then overwrites the same row at the end of the run. That is acceptable for progress snapshots, but it loses intermediate history.
- The current `Telemetry` table can answer coarse questions about steps, files, commands, build success, and token totals. It cannot answer deeper harness questions about attempt outcomes, escalation reasons, model behavior, verification details, durations, or tool-call patterns.
- Telemetry persistence is abstracted through the `TelemetryStore` port (`src/agent/ports/telemetry-store.ts`) with a Prisma adapter, but the persisted schema is the bottleneck.

This plan must respect the architecture contract: pure telemetry assembly stays in `src/agent/domain`, the persistence port lives in `src/agent/ports`, the Prisma adapter lives in `src/agent/adapters/prisma`, and `src/interfaces/inngest` remains orchestration glue.

## What "after" looks like

Keep the existing summary concept, but name and persist it honestly:

```ts
type RunTelemetrySummary = {
  messageId: string;
  runStatus: "running" | "success" | "partial" | "failed" | "provider_error";
  plannerTaskType: string | null;
  totalAttempts: number;
  escalatedTo: string | null;
  escalationReason: string | null;
  verificationSuccessCount: number;
  verificationFailureCount: number;
  steps: number;
  filesRead: number;
  filesWritten: number;
  commandsRun: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  updatedAt: Date;
};
```

Then add append-only detail tables only where they improve analysis:

```
Message
  TelemetrySummary  one row, updated during/finally after a run
  AgentAttempt[]    one row per executor attempt
  AgentStep[]       compact per-step metadata
  AgentVerification[] build/test/lint command outcomes
```

Large or sensitive content should stay out of telemetry by default: raw prompts, reasoning text, full stdout/stderr, file contents, and large tool outputs.

## Chunk index

1. [Summary schema honesty](./01-summary-schema-honesty.md)
2. [Outcome and model dimensions](./02-outcome-and-model-dimensions.md)
3. [Attempt, step, and verification records](./03-attempt-step-verification-records.md)
4. [Analysis queries and archive path](./04-analysis-queries-and-archive-path.md)

Chunks 1 and 2 are the practical first slice. Chunk 3 should wait until the summary row is stable. Chunk 4 validates whether the captured data is actually useful before adding object storage.

## Definition of done

- Summary telemetry persists every field the runtime calculates.
- A successful, failed, partial, provider-error, no-code, and escalated run can be distinguished in stored telemetry.
- Attempt, step, and verification details are available without storing raw user content or large tool outputs.
- Basic internal analysis can report success rate, escalation rate, token usage, verification rate, and failure categories.
- The future eval harness can reuse the same summary/event shape.

## Out of scope

- Replacing Inngest.
- Moving telemetry directly to S3/object storage as the primary store.
- Building a full dashboard in the first implementation pass.
- Persisting raw prompts, reasoning text, full file contents, or full stdout/stderr.
- Redesigning the model ladder or escalation heuristic itself.

## Conflicts checked

Checked `docs/plans/open/` and `docs/plans/drift/`. Overlaps with `openrouter-model-route-fallbacks` on model/route observability: that plan owns routing behavior; this plan owns the durable summary/event schema that records which route and model were attempted and used. No overlap with `sandbox-auto-revive`. `drift/` is empty. The earlier runtime-extraction and Inngest-reliability plans (`agent-runtime-decoupling`, `agent-core-architecture`) have shipped and live in `docs/plans/archive/`.
