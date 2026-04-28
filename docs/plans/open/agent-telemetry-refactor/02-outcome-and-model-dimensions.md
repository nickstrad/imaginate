# 02 — Outcome and model dimensions

**Depends on chunk 1, and on `agent-harness-transport-agnostic/` having shipped (`AgentError`, structured escalation reasons, planner/executor identity in the run result).**

## Goal

Make the summary row useful for answering whether a run succeeded, why it failed or escalated, which model path produced the outcome, and how long it took.

## What changes

- Add `runStatus`, `finalOutputStatus`, `acceptable`, planner/initial/final executor `provider` + `model`, `escalationReason`, `errorCode`, `errorCategory`, `startedAt`, `finishedAt`, `durationMs` to the persisted summary.
- Reuse harness-owned enums for `RunStatus` and `AgentErrorCategory`. Pin a new `EscalationReason` enum in one TS module; free-text values not allowed.
- Index `runStatus`, `finalExecutorModel`, `escalationReason`, `errorCategory` for chunk 3 group-by queries.
- `summarizeRun` (added in chunk 1) reads these straight off the run result and ladder hooks.

## Why now

The harness already exposes all these fields after its refactor; persisting them is a small migration plus column additions.

## Out of scope

- Changing the escalation heuristic.
- Reordering the model ladder.
- Attempt-level rows (a later chunk, only if chunk 3 analysis demands it).

## Done when

- A successful, partial, failed, provider-error, no-code, escalated, and cancelled run can each be distinguished by SQL alone.
- `durationMs` is non-null for every terminal run.
- A test asserts no free-text values leak into `escalationReason`.
