# 04 — Extract `executeWithLadder`

## Goal

Pull the executor ladder out of `runAgent` into a standalone `executeWithLadder` use case with optional hooks, and rewrite the Inngest function to call it instead of forking the loop. After this chunk, there is exactly one ladder implementation in the repo, and Inngest's per-step persistence happens through hooks rather than a duplicated loop.

## The problem

The ladder is implemented twice today:

- `src/agent/application/run-agent.ts:70-160` walks `EXECUTOR_LADDER`, emits `executor.attempt.started` / `executor.step.finished` / `executor.attempt.failed`, and decides escalation.
- `src/interfaces/inngest/functions.ts:208-295` reproduces the same loop because it needs per-step Prisma writes that `runAgent` does not expose.

Concrete duplication points:

- Ladder iteration (`run-agent.ts:78` vs `functions.ts:211`) — same `listExecutorModelIds()` call, same `ladder slot unavailable` warn path.
- Attempt event emission (`run-agent.ts:95` and `:135`/`:152`/`:159` vs `functions.ts:227`/`:265`/`:283`/`:290`) — identical event shapes built independently.
- Escalation decision — both copies decide whether to advance after a retryable failure with the same logic.

Any change to attempt semantics (e.g. structured `AgentError` from chunk 02, or `tool.call.*` correlation from chunk 03) currently has to land in two places. The CLI compounds this — it calls `runAgent`, so it benefits from `run-agent.ts`, but Inngest does not.

## What "after" looks like

```ts
// src/agent/application/execute-with-ladder.ts
export type LadderHooks = {
  onAttemptStart?: (e: {
    attempt: number;
    modelId: string;
  }) => Promise<void> | void;
  onStepFinish?: (e: ExecutorStepFinished) => Promise<void> | void;
  onAttemptFinish?: (e: {
    attempt: number;
    modelId: string;
    outcome: "success" | "retryable_failure" | "terminal_failure";
    error?: AgentError;
  }) => Promise<void> | void;
  onEscalate?: (e: {
    from: string;
    to: string;
    reason: EscalationReason;
  }) => Promise<void> | void;
};

export type LadderOutcome =
  | { kind: "success"; runState: RunState; finalModelId: string }
  | {
      kind: "failure";
      runState: RunState;
      error: AgentError;
      finalModelId: string;
    };

export async function executeWithLadder(args: {
  input: AgentRunInput;
  deps: AgentRuntimeDeps;
  config: AgentRuntimeConfig;
  signal?: AbortSignal;
  hooks?: LadderHooks;
}): Promise<LadderOutcome>;
```

`runAgent` becomes a thin wrapper that calls `executeWithLadder`, applies the optional `persistence` hook (telemetry summary write), and returns `AgentRunResult`. Inngest deletes its forked loop and supplies hooks for per-step Prisma writes:

```ts
// src/interfaces/inngest/functions.ts (after)
const outcome = await executeWithLadder({
  input,
  deps: execDeps,
  config,
  signal,
  hooks: {
    onStepFinish: persistStep, // Prisma write
    onAttemptFinish: persistAttemptStatus,
  },
});
```

Event emission stays inside `executeWithLadder`; hooks observe but do not re-emit.

## Sequencing

1. Add `src/agent/application/execute-with-ladder.ts` with the loop currently in `run-agent.ts:70-160`. Use `AgentError` from chunk 02 for failure outcomes. Accept hooks; default no-op.
2. Rewrite `runAgent` to call `executeWithLadder`, then assemble `AgentRunResult` from the outcome (and emit `agent.finished` / `run.failed` from there as today).
3. Update Inngest's executor handler to call `executeWithLadder` with `onStepFinish` / `onAttemptFinish` hooks performing the existing Prisma writes. Delete the duplicated loop in `src/interfaces/inngest/functions.ts:208-295`.
4. Update tests:
   - Promote any test currently asserting ladder behavior through `runAgent` to also exercise `executeWithLadder` directly with a fake `ModelGateway`.
   - Add a hook-callback test asserting `onStepFinish` is invoked exactly once per executor step and `onAttemptFinish` exactly once per ladder rung.
   - Adjust the Inngest test to assert the function calls `executeWithLadder` and that hooks fire (rather than asserting iteration mechanics).

## Definition of done / verification

- Single ladder implementation lives in `src/agent/application/execute-with-ladder.ts`. `src/interfaces/inngest/functions.ts` contains no `for` loop over `listExecutorModelIds()`.
- `runAgent` is a thin composition: ladder + persistence hook + result assembly.
- Inngest's per-step persistence happens via `onStepFinish` / `onAttemptFinish` hooks; behavior parity with the current path (same Message/Telemetry rows produced for a representative success, retryable-failure, and terminal-failure run).
- New unit tests cover hook firing and outcome shape. `npm test` passes.
- `tsc --noEmit` and lint pass.

## Out of scope

- Removing `MessageStore` from `AgentRuntimeDeps` (chunk 05).
- Renaming `SandboxGateway` → `Workspace` (chunk 09).
- `AbortSignal` / `toolCallGate` plumbing (chunk 06).
- Changing escalation heuristics or ladder ordering.

## Dependencies & conflicts

- **Depends on** chunk 02 (shipped) for `AgentError` and `EscalationReason`.
- **Depends on** chunk 03 (shipped) for `tool.call.*` events — emission stays inside the extracted ladder.
- **Blocks** chunk 05 (`narrow-deps`) — narrowing `AgentRuntimeDeps` is easier once Inngest no longer reaches into the loop.
- **Blocks** `agent-telemetry-refactor/` chunk 01 — its `summarizeRun` consumes `executeWithLadder`'s outcome and hook-traced attempts.
- **No conflict with** `cli-local-sandbox.md`, `planner-complexity-routing.md`, or `cli-ink-app/` chunks 01–02.
- `docs/plans/drift/` contains only its README.
