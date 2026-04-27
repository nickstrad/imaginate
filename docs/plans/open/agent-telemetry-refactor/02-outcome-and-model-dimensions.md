# 02: Outcome and model dimensions

## Goal

Make the summary row useful for answering whether a run succeeded, why it failed or escalated, and which model path produced the outcome.

## The problem

The current summary records activity counts, but not the outcome labels needed for asynchronous analysis. A later query should not have to reconstruct success, provider failure, partial output, or escalation reason from message content and logs.

The system also records `escalatedTo`, but that is only the final executor identity. It does not preserve planner model identity, initial executor identity, provider error category, or the reason escalation happened.

## What "after" looks like

Extend the summary with compact dimensions:

```ts
type RunStatus =
  | "running"
  | "success"
  | "partial"
  | "failed"
  | "provider_error";

type RunTelemetrySummary = {
  runStatus: RunStatus;
  finalOutputStatus: "success" | "partial" | "failed" | null;
  acceptable: boolean;
  plannerProvider: string | null;
  plannerModel: string | null;
  initialExecutorProvider: string | null;
  initialExecutorModel: string | null;
  finalExecutorProvider: string | null;
  finalExecutorModel: string | null;
  escalationReason: string | null;
  providerErrorCategory: string | null;
};
```

Keep these as normalized scalar columns where they are common query dimensions. Use small JSON metadata only for low-frequency or provider-specific details.

## Sequencing

1. Decide the canonical enum/string values for run status and final output status.
2. Thread planner and executor model identity into telemetry assembly.
3. Preserve the escalation reason returned by `shouldEscalate`.
4. Preserve provider error category when a provider error is classified.
5. Add tests for success, partial, failed, provider-error, no-code, and escalated runs.

## Definition of done / verification

- Stored telemetry can distinguish successful, partial, failed, no-code, provider-error, and escalated runs.
- Stored telemetry includes enough model/provider fields to compare model ladder behavior.
- Escalation reason is queryable without parsing logs.

## Out of scope

- Changing the escalation heuristic.
- Reordering the model ladder.
- Adding attempt-level rows. This chunk only enriches the summary.

## Conflicts checked

Overlaps with `openrouter-model-route-fallbacks` on which model/route is recorded: that plan emits the route info, this chunk persists it as queryable summary dimensions.
