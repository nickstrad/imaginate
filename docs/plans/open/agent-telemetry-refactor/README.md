# Agent telemetry refactor

Status: not started.

**Implement after `agent-harness-transport-agnostic/`.** This plan assumes the harness refactor has shipped, so several originally-listed problems no longer exist (lossy errors, lost `RunState`, dead `MessageStore` port, transport-coupled identifiers). What remains is the schema/persistence work.

## Goal

Turn the current agent telemetry summary into a useful feedback loop for improving the harness over time. The end state preserves a compact summary row per turn, enriches it with the dimensions needed to answer real harness questions, validates whether the summary alone is enough, and only then adds narrow append-only detail tables.

PostgreSQL is the only store. No object storage, no JSONL archive path — those are explicitly out of scope.

## What changed because of the harness refactor

The harness refactor delivers (in shipping order):

- `runAgent` returns a frozen `RunState` (chunk 1 of the harness plan).
- A structured `AgentError { code, category, retryable, message }` is on `AgentRunResult.error` and on `executor.attempt.failed` / `run.failed` events (chunk 2).
- The executor ladder lives in `executeWithLadder` with hooks (`onAttemptStart`, `onAttemptFinish`, `onEscalate`, `onStepFinish`) that transports compose (chunk 4).
- `MessageStore` is removed from the harness; persistence is opt-in via `runAgent({ persistence: { telemetryStore, turnKey } })` (chunk 5).
- The `TelemetryStore` port is keyed by an opaque `turnKey: string`, not `messageId`.

Consequences for this plan:

- **Telemetry assembly becomes a pure function** over `(RunState, AgentRunResult, ladderTrace)`. Today's mutation-driven `buildTelemetry` collapses into a one-shot `summarizeRun` called once at the end.
- **No more per-step upsert question.** The harness no longer writes telemetry per step. If a transport wants in-flight progress it implements `onStepFinish` itself; the summary row is written exactly once at the end.
- **`providerErrorCategory` is no longer recomputed here.** It comes straight from `AgentError.category` on the failed attempt or run.
- **`escalationReason` is structured.** It comes from `executeWithLadder`'s `onEscalate` / final outcome, not from string parsing.
- **`turnKey` replaces `messageId` on the port.** Web adapter resolves `turnKey → messageId` internally before the FK upsert. The Prisma column name (`messageId`) and FK to `Message` can stay in the web schema; only the port surface changes.

## The problem (post-refactor)

- `prisma/schema.prisma` still persists fewer fields than the harness now exposes. After chunk 2 of the harness refactor, the runtime has run status, planner/executor identity, escalation reason, error category, and run duration — none of which are stored.
- Telemetry is written but never read by the app: `src/features/messages/adapters/prisma-message-repository.ts:38` does not include the relation, so nothing surfaces it.
- Without bounded-cardinality enums for status / escalation / error category, group-by analysis queries are not stable.

## What "after" looks like

A single per-turn row keyed by `turnKey` (FK to `Message` lives in the web adapter, not in the harness):

```ts
type RunTelemetrySummary = {
  turnKey: string;

  runStatus: "success" | "partial" | "failed" | "provider_error" | "cancelled";
  finalOutputStatus: "success" | "partial" | "failed" | null;
  acceptable: boolean;

  plannerTaskType: string | null;
  plannerProvider: string | null;
  plannerModel: string | null;

  initialExecutorProvider: string | null;
  initialExecutorModel: string | null;
  finalExecutorProvider: string | null;
  finalExecutorModel: string | null;
  totalAttempts: number;
  escalatedTo: string | null;
  escalationReason: EscalationReason; // pinned enum, see chunk 2
  errorCode: string | null; // from AgentError.code
  errorCategory: AgentErrorCategory | null; // from AgentError.category

  steps: number;
  filesRead: number;
  filesWritten: number;
  commandsRun: number;
  verificationSuccessCount: number;
  verificationFailureCount: number;
  buildSucceeded: boolean;

  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;

  startedAt: Date;
  finishedAt: Date;
  durationMs: number;

  createdAt: Date;
};
```

Append-only detail tables come later, only if chunk 3's analysis proves the summary cannot answer real questions:

```
TelemetrySummary       one row per turn, written once after a run
  AgentAttempt[]       (chunk 4) one row per executor attempt
  AgentVerification[]  (chunk 4) one row per build/test/lint command
```

Per-step rows are deliberately not planned. If a specific question requires per-step data, open a follow-up.

Large or sensitive content stays out of telemetry by default: raw prompts, reasoning text, full stdout/stderr, file contents, large tool outputs.

## Chunk index

**Per `docs/plans/AGENTS.md`, only the next two chunks have files. Later chunks are one-line stubs and get promoted to full files when they become the next-to-implement.**

1. [`01-summary-schema-honesty.md`](01-summary-schema-honesty.md) — port the runtime's full summary into Postgres; rekey on `turnKey`; add indexes. _(current chunk, full detail)_
2. [`02-outcome-and-model-dimensions.md`](02-outcome-and-model-dimensions.md) — persist run status, planner/executor identity, escalation reason, error code/category, run duration. _(N+1, lighter detail)_
3. `03-analysis-on-summary` — prove (or disprove) that the summary answers real harness questions before adding detail tables. Surface telemetry in the existing message query. **Gate before chunk 4.**
4. `04-attempt-and-verification-records` — only if chunk 3 shows the summary is insufficient. Adds narrow append-only `AgentAttempt` and `AgentVerification` tables.

## Definition of done

- Summary telemetry persists every field the runtime exposes after the harness refactor.
- A successful, failed, partial, provider-error, no-code, escalated, and cancelled run can be distinguished in stored telemetry.
- A single SQL/script invocation can report success rate, escalation rate, token usage, and verification rate.
- Telemetry is exposed through the existing message query so the app can read what it writes.
- If chunk 4 ships, attempt and verification details exist without storing raw user content or large tool outputs.
- The future eval harness can reuse the same summary shape.

## Out of scope

- Replacing Inngest.
- Object storage / S3 / JSONL archive of any kind. Postgres only.
- Per-step telemetry rows (`AgentStepTelemetry`).
- Building a full dashboard.
- Persisting raw prompts, reasoning text, full file contents, or full stdout/stderr.
- Redesigning the model ladder or escalation heuristic itself.
- Real-time alerting.
- Anything already delivered by `agent-harness-transport-agnostic/` (error taxonomy, structured `RunState`, ladder hooks, narrowed deps).

## Dependencies & conflicts

- **Depends on `agent-harness-transport-agnostic/`** — specifically the frozen `RunState` (chunk 1), `AgentError` (chunk 2), `executeWithLadder` hooks (chunk 4 stub), and the `turnKey`-keyed `TelemetryStore` (chunk 5 stub). Do not start until at least Phase B of the harness plan ships.
- **Coordinates with `openrouter-model-route-fallbacks.md`** — that plan emits routing decisions into the run result; this plan persists them as queryable summary dimensions. The two share the planner/executor identity fields and must agree on names.
- **Coordinates with `cli-ink-app/`** — chunk 04 of Ink writes a per-folder SQLite `telemetry` table that mirrors this plan's `RunTelemetrySummary` shape. Schemas differ (SQLite vs Postgres); the TS type is shared.
- **No conflict with** `cli-local-sandbox.md`, `sandbox-auto-revive.md`, or `enforce-dumb-presentation-views.md`.
- `docs/plans/drift/` contains only its README.
