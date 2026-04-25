# Split the `runExecutorOnce` step callback

Deferred from the testability refactor (Phase 9 — `functions.ts` decomposition).

Status: ⬜ not started.
Depends on: [`RunState` reducers](./04-run-state-reducers.md), [Prisma repository layer](./01-prisma-repository-layer.md).

## Goal

The `onStepFinish` callback in `runExecutorOnce` mixes pure state updates with I/O. Split it into a pure reducer in `src/lib/agents/state.ts` and an I/O helper in `src/lib/agents/telemetry.ts`.

## Before

`src/inngest/functions.ts` (≈ line 237):

```ts
onStepFinish: async (stepResult) => {
  const stepText = stepTextOf(stepResult);

  log.info({
    event: "agent step",
    metadata: { stepIndex: stepResult.stepNumber, ... },
  });

  const newThought = ThoughtSchema.parse({
    stepIndex: stepResult.stepNumber,
    text: stepText,
    toolCalls: stepResult.toolCalls?.map((tc) => ({ toolName: tc.toolName, args: tc.input })),
    toolResults: stepResult.toolResults?.map((tr) =>
      typeof tr.output === "string" ? tr.output : JSON.stringify(tr.output)
    ),
    reasoningText: stepResult.reasoning?.[0]?.text,
    finishReason: stepResult.finishReason,
  });
  thoughts.push(newThought);

  const usage = readUsage(stepResult.usage);
  cumulativeUsage.promptTokens += usage.promptTokens;
  cumulativeUsage.completionTokens += usage.completionTokens;
  cumulativeUsage.totalTokens += usage.totalTokens;

  const stepsCompleted = stepResult.stepNumber + 1;
  await Promise.all([
    prisma.message.update({
      where: { id: persistedMessageId },
      data: { thoughts: thoughtsToPrismaJson(thoughts) },
    }),
    persistTelemetry(
      persistedMessageId,
      buildTelemetry(runState, stepsCompleted, cumulativeUsage)
    ).catch((e) => log.warn({ event: "telemetry snapshot failed", metadata: { err: String(e) } })),
  ]);
}
```

70+ lines mixing parsing, mutation, logging, and two DB writes.

## After

`src/lib/agents/state.ts` (pure):

```ts
export function onToolStep(
  state: RunState,
  step: StepResult
): { state: RunState; thought: Thought; stepsCompleted: number } {
  const thought = ThoughtSchema.parse({
    stepIndex: step.stepNumber,
    text: stepTextOf(step),
    toolCalls: step.toolCalls?.map((tc) => ({
      toolName: tc.toolName,
      args: tc.input,
    })),
    toolResults: step.toolResults?.map((tr) =>
      typeof tr.output === "string" ? tr.output : JSON.stringify(tr.output)
    ),
    reasoningText: step.reasoning?.[0]?.text,
    finishReason: step.finishReason,
  });
  const next = accumulateUsage(
    recordThought(state, thought),
    readUsage(step.usage)
  );
  return { state: next, thought, stepsCompleted: step.stepNumber + 1 };
}
```

`src/lib/agents/telemetry.ts` (I/O):

```ts
export async function recordStep(
  deps: { messages: MessageRepo; telemetry: TelemetryStore; log: Logger },
  args: {
    persistedMessageId: string;
    thoughts: Thought[];
    runState: RunState;
    stepsCompleted: number;
  }
): Promise<void> {
  await Promise.all([
    deps.messages.updateThoughts(
      args.persistedMessageId,
      thoughtsToPrismaJson(args.thoughts)
    ),
    deps.telemetry
      .persist(
        args.persistedMessageId,
        buildTelemetry(
          args.runState,
          args.stepsCompleted,
          args.runState.cumulativeUsage
        )
      )
      .catch((e) =>
        deps.log.warn({
          event: "telemetry snapshot failed",
          metadata: { err: String(e) },
        })
      ),
  ]);
}
```

`src/inngest/functions.ts`:

```ts
onStepFinish: async (stepResult) => {
  log.info({ event: "agent step", metadata: { stepIndex: stepResult.stepNumber, ... } });
  const { state, thought, stepsCompleted } = onToolStep(runState, stepResult);
  runState = state;
  thoughts.push(thought);
  await recordStep(
    { messages: messageRepo, telemetry: telemetryStore, log },
    { persistedMessageId, thoughts, runState, stepsCompleted }
  );
};
```

## Gain

- `onToolStep` is unit-testable: feed a `StepResult`, assert reduced state and parsed thought.
- The Inngest callback shrinks to ~6 lines — clearly orchestration only.
- Telemetry/message persistence policy lives next to the rest of the telemetry code.
