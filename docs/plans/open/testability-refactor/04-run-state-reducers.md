# `RunState` reducers

Deferred from the testability refactor (Phase 8 deeper split — agent-tools).

Status: 🟡 partial — `markVerification` / `inferVerificationKind` already extracted.

## Goal

Replace the inline `runState` mutations scattered through `tools.ts` and the `onStepFinish` callback in `functions.ts` with pure reducers in `src/lib/agents/state.ts`.

## Before

Mutations are inlined wherever they happen:

```ts
// src/lib/agents/tools.ts
runState.commandsRun.push({ command, success: res.success });

// src/inngest/functions.ts (onStepFinish)
thoughts.push(newThought);
const usage = readUsage(stepResult.usage);
cumulativeUsage.promptTokens += usage.promptTokens;
cumulativeUsage.completionTokens += usage.completionTokens;
cumulativeUsage.totalTokens += usage.totalTokens;
```

State updates are tangled with I/O — telemetry persistence, message updates — so they can't be unit-tested in isolation.

## After

`src/lib/agents/state.ts` extends with pure reducers:

```ts
export function recordCommand(
  state: RunState,
  cmd: { command: string; success: boolean }
): RunState {
  return { ...state, commandsRun: [...state.commandsRun, cmd] };
}

export function recordThought(state: RunState, thought: Thought): RunState {
  return { ...state, thoughts: [...state.thoughts, thought] };
}

export function accumulateUsage(state: RunState, usage: UsageTotals): RunState {
  return {
    ...state,
    cumulativeUsage: {
      promptTokens: state.cumulativeUsage.promptTokens + usage.promptTokens,
      completionTokens:
        state.cumulativeUsage.completionTokens + usage.completionTokens,
      totalTokens: state.cumulativeUsage.totalTokens + usage.totalTokens,
    },
  };
}
```

Callers pipe through reducers:

```ts
// tools.ts
state = recordCommand(state, { command, success: res.success });

// functions.ts
state = recordThought(state, newThought);
state = accumulateUsage(state, readUsage(stepResult.usage));
```

Test:

```ts
expect(recordCommand(initial, { command: "ls", success: true })).toEqual({
  ...initial,
  commandsRun: [{ command: "ls", success: true }],
});
```

## Gain

- Reducers are unit-testable without sandbox, AI, or DB.
- State transitions become explicit at call sites — you can read the file and see what changes when.
- Sets up a future move to a single `applyStep(state, step)` reducer if useful.

## Doc updates (same PR)

- Note the new reducers in `state.ts` under `src/lib/agents/` in `docs/architecture/architecture.md`.
