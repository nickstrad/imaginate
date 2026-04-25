# `persistRun` helper

Deferred from the testability refactor (Phase 9 — `functions.ts` decomposition).

Status: ⬜ not started.
Depends on: [Prisma repository layer](./prisma-repository-layer.md).

## Goal

Bundle the post-run writes (final message + telemetry) into a single helper in `src/lib/agents/telemetry.ts` next to the existing `persistTelemetryWith`.

## Before

`src/inngest/functions.ts` inlines the post-run persistence:

```ts
const finalMessage = formatFinalMessage(runState, outcome);
await prisma.message.update({
  where: { id: persistedMessageId },
  data: {
    content: finalMessage,
    type: runState.finalOutput?.status === "success" ? "RESULT" : "ERROR",
    thoughts: thoughtsToPrismaJson(thoughts),
  },
});
await persistTelemetry(
  persistedMessageId,
  buildTelemetry(runState, outcome.stepsCount, outcome.usage)
).catch((e) =>
  log.warn({ event: "telemetry persist failed", metadata: { err: String(e) } })
);
```

The Inngest function knows the shape of both the message row and the telemetry row.

## After

`src/lib/agents/telemetry.ts`:

```ts
export async function persistRun(
  deps: { messages: MessageRepo; telemetry: TelemetryStore; log: Logger },
  args: {
    persistedMessageId: string;
    runState: RunState;
    thoughts: Thought[];
    outcome: ExecuteOutcome;
  }
): Promise<void> {
  const { persistedMessageId, runState, thoughts, outcome } = args;
  await deps.messages.update(persistedMessageId, {
    content: formatFinalMessage(runState, outcome),
    type: runState.finalOutput?.status === "success" ? "RESULT" : "ERROR",
    thoughts: thoughtsToPrismaJson(thoughts),
  });
  await deps.telemetry
    .persist(
      persistedMessageId,
      buildTelemetry(runState, outcome.stepsCount, outcome.usage)
    )
    .catch((e) =>
      deps.log.warn({
        event: "telemetry persist failed",
        metadata: { err: String(e) },
      })
    );
}
```

`src/inngest/functions.ts`:

```ts
await persistRun(
  { messages: messageRepo, telemetry: telemetryStore, log },
  { persistedMessageId, runState, thoughts, outcome }
);
```

## Gain

- One call replaces ~15 lines of orchestration in the Inngest function.
- Persistence is testable with fake repos (no Prisma client required).
- Failure handling for telemetry vs. message stays in one place — easier to reason about partial-write recovery later.
