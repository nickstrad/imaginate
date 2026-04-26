# Chunk 2: Executor And Runner Extraction

## Goal

Move executor attempt logic and escalation-loop orchestration out of `src/inngest/functions.ts` into `src/lib/agents`.

This is the main decoupling step. The extracted runner should not import from `src/inngest`, `src/modules`, `src/app`, or Prisma.

## Files

- Add `src/lib/agents/executor.ts`
- Add `src/lib/agents/runner.ts`
- Extend `src/lib/agents/runtime.ts`
- Update `src/lib/agents/index.ts`
- Update `src/inngest/functions.ts`
- Add or update tests under `src/lib/agents`

## Runtime Types

Add to `src/lib/agents/runtime.ts` (so both `executor.ts`, `runner.ts`, and external consumers share one source):

```ts
export type AgentStepSnapshot = {
  stepIndex: number;
  thought: Thought; // reuses @/lib/schemas/thought
  finishReason: string | undefined;
};

export type ExecutorAttemptResult = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any; // AI SDK GenerateTextResult; kept loose to avoid leaking SDK types into the public surface
  escalated: boolean;
  reason?: string;
  error?: unknown;
};

export type ExecuteOutcome = {
  runState: RunState;
  stepsCount: number;
  usage: UsageTotals;
  lastErrorMessage: string | null;
};
```

Extend `AgentRuntimeHooks`:

```ts
export type AgentRuntimeHooks = {
  getSandbox: () => Promise<SandboxLike>;
  emit?: (event: AgentRuntimeEvent) => void | Promise<void>;
  persistTelemetry?: (payload: TelemetryPayload) => void | Promise<void>;
};
```

> `getSandbox` becomes required for the executor path. Chunk 01's planner-only callers (no executor) can still pass hooks without it via a separate type — see "Backward compatibility" below.

Extend `AgentRuntimeEvent`:

```ts
| { type: "executor.attempt.started"; attempt: number; model: string }
| { type: "executor.step.finished"; step: AgentStepSnapshot }
| { type: "executor.attempt.failed"; attempt: number; category: string; retryable: boolean }
| { type: "executor.escalated"; attempt: number; reason?: string }
| { type: "executor.accepted"; attempt: number }
| {
    type: "agent.finished";
    stepsCount: number;
    usage: UsageTotals;
    finalOutput: FinalOutput | undefined;
    lastErrorMessage: string | null;
  }
```

Keep event payloads compact: `agent.finished` carries the small summary fields rather than the whole `ExecuteOutcome` (which embeds `runState.filesWritten`). The full `ExecuteOutcome` is still returned by `runCodingAgentWithEscalation`; the event is for observability.

### Backward compatibility

Chunk 01 declared `AgentRuntimeHooks` with only an optional `emit`. Making `getSandbox` required would break the planner-only call site. Resolve this by splitting the type:

```ts
export type AgentRuntimeBaseHooks = {
  emit?: (event: AgentRuntimeEvent) => void | Promise<void>;
};

export type AgentRuntimeHooks = AgentRuntimeBaseHooks & {
  getSandbox: () => Promise<SandboxLike>;
  persistTelemetry?: (payload: TelemetryPayload) => void | Promise<void>;
};
```

`runPlanner` accepts `AgentRuntimeBaseHooks`; the executor/runner accept `AgentRuntimeHooks`. Update `planner.ts` accordingly in this chunk.

## Executor API

Recommended shape:

```ts
export type RunCodingOpts = {
  thoughts: Thought[];
  cumulativeUsage: UsageTotals;
  plan: PlanOutput;
  runState: RunState;
  previousMessages: ModelMessage[];
  userPrompt: string;
  log: Logger;
  hooks: AgentRuntimeHooks;
  generateText?: GenerateTextFn; // injected for tests; defaults to the AI SDK
};

export async function runExecutorOnce(
  spec: ModelSpec,
  modelConfig: ResolvedModelConfig,
  opts: RunCodingOpts
): Promise<ExecutorAttemptResult>;
```

Important changes vs. today's signature:

- Remove `persistedMessageId`. The executor emits step snapshots and optionally calls `persistTelemetry`; it does not know how app messages are stored.
- Remove `sandboxId`. Sandbox access goes through `opts.hooks.getSandbox()`, which is what the existing `tools.ts` factories already accept.
- `thoughts` stays. The current `extractTaskSummaryFallback` helper iterates `thoughts` to find a fallback final output; that stays in the runner. The Inngest adapter (chunk 03) reads the same array via the `executor.step.finished` event.
- `toAgentStepSnapshot(stepResult)` is a private helper in `executor.ts` that builds the `AgentStepSnapshot` (parses `ThoughtSchema`, computes `stepText`, etc.). Not exported.

## Runner API

Recommended shape:

```ts
export async function runCodingAgentWithEscalation(
  opts: RunCodingOpts
): Promise<ExecuteOutcome>;
```

Preserve current behavior:

- executor ladder order from `EXECUTOR_LADDER`
- unavailable ladder slots are skipped with warning
- retryable provider failures continue to next model
- non-retryable provider failures stop escalation
- `shouldEscalate` drives model escalation
- task-summary fallback still populates `runState.finalOutput`
- usage totals accumulate per step

## Tests

Prioritize tests that avoid real providers and real sandboxes:

- runner tries fallback model when first attempt throws retryable provider error
- runner stops on non-retryable provider error
- runner emits attempt/escalation/accepted events
- executor emits step events and updates usage totals
- executor writes final output through the existing `finalize` tool behavior

If the AI SDK is hard to fake directly, introduce a tiny injectable `generateText` dependency in this chunk:

```ts
type GenerateTextFn = typeof generateText;
```

Default to the real AI SDK in production; tests pass a fake.

## Target Integration Example

The extracted executor would own model/tool behavior, but not app persistence:

```ts
// src/lib/agents/executor.ts
export async function runExecutorOnce(
  spec: ModelSpec,
  modelConfig: ResolvedModelConfig,
  opts: RunCodingOpts
): Promise<ExecutorAttemptResult> {
  opts.runState.totalAttempts += 1;
  opts.runState.escalatedTo = `${spec.provider}:${spec.model}`;

  const toolDeps = {
    getSandbox: opts.hooks.getSandbox,
    runState: opts.runState,
  };

  const result = await generateText({
    model: createModelProvider(modelConfig),
    system: buildExecutorSystemPrompt(planSnippet(opts.plan)),
    messages: [
      ...opts.previousMessages,
      { role: "user", content: opts.userPrompt },
    ],
    tools: {
      terminal: createTerminalTool(toolDeps),
      listFiles: createListFilesTool(toolDeps),
      readFiles: createReadFilesTool(toolDeps),
      writeFiles: createWriteFilesTool(toolDeps),
      replaceInFile: createReplaceInFileTool(toolDeps),
      applyPatch: createApplyPatchTool(toolDeps),
      runBuild: createRunBuildTool(toolDeps),
      runTests: createRunTestsTool(toolDeps),
      runLint: createRunLintTool(toolDeps),
      finalize: createFinalizeTool(toolDeps),
    },
    onStepFinish: async (stepResult) => {
      const step = toAgentStepSnapshot(stepResult);
      opts.thoughts.push(step.thought);
      addUsage(opts.cumulativeUsage, readUsage(stepResult.usage));

      await opts.hooks.emit?.({
        type: "executor.step.finished",
        step,
      });

      await opts.hooks.persistTelemetry?.(
        buildTelemetry(opts.runState, step.stepIndex + 1, opts.cumulativeUsage)
      );
    },
  });

  const decision = shouldEscalate(opts.runState, result);
  return { result, escalated: decision.escalate, reason: decision.reason };
}
```

The runner owns the ladder. Full sketch — preserves every behavior listed in the "Preserve current behavior" section above (try/catch around `resolveSpec`, retryable vs. non-retryable provider error handling, `lastResult`/`lastError`/`stepsCount` accumulation, fallback final output):

```ts
// src/lib/agents/runner.ts
export async function runCodingAgentWithEscalation(
  opts: RunCodingOpts
): Promise<ExecuteOutcome> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastResult: any = null;
  let lastError: unknown;

  for (let i = 0; i < EXECUTOR_LADDER.length; i++) {
    const spec = EXECUTOR_LADDER[i];
    let modelConfig: ResolvedModelConfig;
    try {
      modelConfig = resolveSpec(spec);
    } catch (err) {
      opts.log.warn({
        event: "ladder slot unavailable",
        metadata: { spec, err: String(err) },
      });
      lastError = err;
      continue;
    }

    await opts.hooks.emit?.({
      type: "executor.attempt.started",
      attempt: i + 1,
      model: `${modelConfig.provider}:${modelConfig.model}`,
    });

    const outcome = await runExecutorOnce(spec, modelConfig, opts);
    lastResult = outcome.result;

    if (outcome.error) {
      const classified = classifyProviderError(outcome.error);
      lastError = outcome.error;
      await opts.hooks.emit?.({
        type: "executor.attempt.failed",
        attempt: i + 1,
        category: classified.category,
        retryable: classified.retryable,
      });
      if (!classified.retryable) break;
      continue;
    }

    if (!outcome.escalated) {
      await opts.hooks.emit?.({ type: "executor.accepted", attempt: i + 1 });
      break;
    }

    await opts.hooks.emit?.({
      type: "executor.escalated",
      attempt: i + 1,
      reason: outcome.reason,
    });
  }

  const stepsCount = Array.isArray(lastResult?.steps)
    ? lastResult.steps.length
    : 0;
  const lastErrorMessage =
    lastError === undefined
      ? null
      : lastError instanceof Error
        ? lastError.message
        : String(lastError);

  const executeOutcome: ExecuteOutcome = {
    runState: opts.runState,
    stepsCount,
    usage: opts.cumulativeUsage,
    lastErrorMessage,
  };

  await opts.hooks.emit?.({
    type: "agent.finished",
    stepsCount,
    usage: opts.cumulativeUsage,
    finalOutput: opts.runState.finalOutput,
    lastErrorMessage,
  });

  return executeOutcome;
}
```

Note that the task-summary fallback (today's `extractTaskSummaryFallback`) moves into `runExecutorOnce` (or a private helper in `executor.ts`); it must run before the `shouldEscalate` decision, exactly as today.

Tests could pass a fake generator and fake sandbox:

```ts
const events: AgentRuntimeEvent[] = [];

const outcome = await runCodingAgentWithEscalation({
  userPrompt: "make the button blue",
  previousMessages: [],
  plan,
  runState: createRunState(),
  thoughts: [],
  cumulativeUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  log: testLogger,
  hooks: {
    getSandbox: async () => fakeSandbox,
    emit: (event) => events.push(event),
  },
  generateText: fakeGenerateText,
});

expect(events.some((e) => e.type === "executor.accepted")).toBe(true);
expect(outcome.runState.finalOutput?.status).toBe("success");
```

## Out Of Scope

- Wiring runtime events to Prisma persistence (thoughts, telemetry, final message). That's chunk 03 — this chunk only emits events; the Inngest call site can still pass the existing `onStepFinish`-equivalent logic via `hooks.emit`.
- Removing `loggedStep`/`step.run` boundaries from `src/inngest/functions.ts`. Chunk 03.
- Any changes to `tools.ts`, `decisions.ts`, `state.ts`, `telemetry.ts`. Their existing public API is sufficient.
- The `askAgent` Inngest function. It does not use the executor ladder.

## Conflicts Checked

Reviewed `docs/plans/open/` (no `drift/` exists). No conflicts:

- `agent-telemetry-refactor/` — telemetry schema/queries; unrelated to orchestration extraction.
- `testability-refactor/07-split-executor-step-callback.md` — proposes splitting today's `onStepFinish` body inside `src/inngest/functions.ts`. This chunk supersedes that work by moving the callback into `executor.ts` and surfacing the persistence side via `hooks.emit`. When this chunk lands, mark `07-split-executor-step-callback.md` superseded.
- `inngest-reliability-refactor.md`, `sandbox-auto-revive.md`, `messages-container-tests.md` — disjoint surfaces.

## Acceptance

- No executor attempt or escalation-loop implementation remains in `src/inngest/functions.ts`.
- `src/lib/agents/{executor,runner}.ts` do not import Inngest or Prisma.
- Inngest still compiles and can call the extracted runner.
- Agent tests cover at least one successful path and one escalation path.
