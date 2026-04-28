# 01 — `runAgent` returns `RunState`

## Goal

Stop discarding `RunState` from `runAgent`. Return a frozen view alongside the existing `AgentRunResult` fields so transports can render thoughts, files written, commands run, and verification without rebuilding state from the event stream.

## The problem

`src/agent/application/run-agent.ts:178` returns `{ finalOutput, stepsCount, usage, lastErrorMessage }`. The richer `RunState` (thoughts, files read/written, commands run, verifications, attempts) is built up inside `executeRun` and thrown away.

Consequences today:

- The CLI reconstructs everything from `AgentRuntimeEvent`s (`src/interfaces/cli/agent-local.ts:558`).
- Inngest avoids `runAgent` and re-implements the ladder (`src/interfaces/inngest/functions.ts:203-283`) so it can keep `runState` for persistence.

## What "after" looks like

```ts
// src/agent/domain/types.ts
export type AgentRunResult = {
  finalOutput?: FinalOutput;
  stepsCount: number;
  usage: UsageTotals;
  lastErrorMessage?: string;
  runState: Readonly<RunState>; // NEW — frozen snapshot
};
```

`runState` is `Object.freeze`d (deep-frozen for nested arrays) before return. Mutating it from the outside throws in dev, no-ops in prod. Consumers treat it as a structured summary, not a handle.

## Sequencing

1. Deep-freeze helper in `src/agent/domain/run-state.ts`.
2. `runAgent` snapshots and freezes `runState` at every return path (success, failure, no-code) and includes it in `AgentRunResult`.
3. Update tests for `runAgent` to assert `runState` is present and frozen.
4. Update the CLI to consume `result.runState` for the final summary instead of reconstructing from events. Keep events as the live progress channel.

## Definition of done

- `AgentRunResult.runState` is non-null on every return path.
- Mutating `runState` post-return throws in tests.
- CLI summary code reads `result.runState` instead of accumulating from events.
- No transport behavior change otherwise.

## Out of scope

- Removing the event stream (it's still the live channel).
- Inngest deleting its forked loop (that's chunk 4).
- Changing `RunState`'s shape.
