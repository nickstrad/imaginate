# Chunk 3: Inngest Adapter

## Goal

Keep Inngest as a thin adapter around the extracted planner/executor runtime.

Inngest should own durable steps, app persistence, and sandbox lifecycle. It should not own agent orchestration logic.

## Files

- Update `src/inngest/functions.ts`
- Optionally add `src/inngest/agent-adapter.ts` if `functions.ts` remains too large
- Update tests if any compile-time expectations change

## Responsibilities

`src/inngest/functions.ts` should keep:

- `inngest.createFunction(...)`
- event data extraction
- `step.run(...)` boundaries
- assistant message creation
- no-code answer persistence
- sandbox creation and preview URL lookup
- final result persistence into `Message` and `Fragment`
- provider error persistence

The extracted runtime should own:

- planner model call
- executor model call
- tool construction
- executor ladder
- escalation decisions
- usage accumulation
- final-output fallback
- runtime event emission

## Adapter Hooks

Build hooks near the `execute` step:

```ts
const hooks: AgentRuntimeHooks = {
  getSandbox: () => getSandbox(sandboxId),
  emit: async (event) => {
    // map executor.step.finished to ThoughtSchema + Prisma update
    // map other events to log entries
  },
  persistTelemetry: async (payload) => {
    await persistTelemetry(persistedMessage.id, payload);
  },
};
```

The existing `onStepFinish` body currently inside `runExecutorOnce` should move into the Inngest `emit` handler where it persists thoughts to Prisma.

## Durable Step Boundaries

Keep the current high-level Inngest durability:

```ts
const plan = await loggedStep(log, step, "plan", () => runPlanner(...));

const executeOutcome = await loggedStep(log, step, "execute", () =>
  runCodingAgentWithEscalation(...)
);
```

Do not put `step.run` inside the extracted `src/lib/agents` runtime.

## Target Integration Example

The final Inngest code should read as adapter code: prepare app state, call runtime, persist result.

```ts
// src/inngest/functions.ts
const plan = await loggedStep(log, step, "plan", () =>
  runPlanner({
    userPrompt,
    previousMessages: previousMessages as ModelMessage[],
    log,
    hooks: {
      emit: (event) => logAgentRuntimeEvent(log, event),
    },
  })
);

runState.plan = plan;

if (!plan.requiresCoding) {
  return saveNoCodeAnswer({
    messageId: persistedMessage.id,
    answer: plan.answer,
    plan,
  });
}

const sandboxId = await loggedStep(log, step, "get-sandbox-id", async () => {
  const sandbox = await Sandbox.create("imaginate-dev");
  await sandbox.setTimeout(SANDBOX_DEFAULT_TIMEOUT_MS);
  return sandbox.sandboxId;
});

const runtimeHooks: AgentRuntimeHooks = {
  getSandbox: () => getSandbox(sandboxId),
  emit: async (event) => {
    logAgentRuntimeEvent(log, event);

    if (event.type === "executor.step.finished") {
      thoughts.push(event.step.thought);

      await prisma.message.update({
        where: { id: persistedMessage.id },
        data: { thoughts: thoughtsToPrismaJson(thoughts) },
      });
    }
  },
  persistTelemetry: async (payload) => {
    await persistTelemetry(persistedMessage.id, payload);
  },
};

const executeOutcome = await loggedStep(log, step, "execute", () =>
  runCodingAgentWithEscalation({
    thoughts,
    cumulativeUsage,
    plan,
    runState,
    previousMessages: previousMessages as ModelMessage[],
    userPrompt,
    log,
    hooks: runtimeHooks,
  })
);
```

The final result persistence remains in Inngest:

```ts
// src/inngest/functions.ts
const finalRunState = executeOutcome.runState;
const finalOutput = finalRunState.finalOutput;

if (executeOutcome.lastErrorMessage && !finalOutput) {
  const classified = classifyProviderError(executeOutcome.lastErrorMessage);
  await saveProviderError(persistedMessage.id, classified);
  return { error: classified.userMessage, category: classified.category };
}

const sandbox = await getSandbox(sandboxId);
await ensurePreviewReady(sandbox);
const sandboxUrl = getSandboxUrl(sandbox);

await saveAgentResult({
  messageId: persistedMessage.id,
  projectId: event.data.projectId,
  sandboxUrl,
  finalRunState,
  finalOutput,
});
```

Optional helper if `functions.ts` still feels heavy:

```ts
// src/inngest/agent-adapter.ts
export function createInngestAgentHooks({
  sandboxId,
  persistedMessageId,
  thoughts,
  log,
}: CreateInngestAgentHooksInput): AgentRuntimeHooks {
  return {
    getSandbox: () => getSandbox(sandboxId),
    emit: (event) =>
      persistRuntimeEvent({ event, persistedMessageId, thoughts, log }),
    persistTelemetry: (payload) =>
      persistTelemetry(persistedMessageId, payload),
  };
}
```

## Replay Note

The current code has a replay-sensitive comment:

> Inngest replays don't re-run step.run callbacks, so in-closure runState mutations are lost.

Preserve this behavior by ensuring `ExecuteOutcome` returns the final `runState`, `stepsCount`, usage totals, and last error message. The Inngest adapter should continue reading from the returned outcome after the `execute` step.

## Acceptance

- `src/inngest/functions.ts` is visibly smaller and mostly adapter code.
- Inngest path still persists thoughts, telemetry, final message, and fragment exactly as before.
- No extracted `src/lib/agents` file imports Prisma or Inngest.
- The app still builds.
