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

## Runtime Hooks

Extend `AgentRuntimeHooks`:

```ts
export type AgentRuntimeHooks = {
  getSandbox: () => Promise<SandboxLike>;
  emit?: (event: AgentRuntimeEvent) => void | Promise<void>;
  persistTelemetry?: (payload: TelemetryPayload) => void | Promise<void>;
};
```

Extend `AgentRuntimeEvent`:

```ts
| { type: "executor.attempt.started"; attempt: number; model: string }
| { type: "executor.step.finished"; step: AgentStepSnapshot }
| { type: "executor.attempt.failed"; attempt: number; category: string; retryable: boolean }
| { type: "executor.escalated"; attempt: number; reason?: string }
| { type: "executor.accepted"; attempt: number }
| { type: "agent.finished"; outcome: ExecuteOutcome }
```

Keep event payloads compact. They should be useful for logs and local terminal output without embedding huge stdout blobs by default.

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
};

export async function runExecutorOnce(
  spec: ModelSpec,
  modelConfig: ResolvedModelConfig,
  opts: RunCodingOpts
): Promise<ExecutorAttemptResult>;
```

Important change: remove `persistedMessageId` from the core executor. The executor should emit step snapshots and optionally call `persistTelemetry`; it should not know how app messages are stored.

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

The runner would own the ladder:

```ts
// src/lib/agents/runner.ts
export async function runCodingAgentWithEscalation(
  opts: RunCodingOpts
): Promise<ExecuteOutcome> {
  for (let i = 0; i < EXECUTOR_LADDER.length; i++) {
    const spec = EXECUTOR_LADDER[i];
    const modelConfig = resolveSpec(spec);

    await opts.hooks.emit?.({
      type: "executor.attempt.started",
      attempt: i + 1,
      model: `${modelConfig.provider}:${modelConfig.model}`,
    });

    const outcome = await runExecutorOnce(spec, modelConfig, opts);

    if (!outcome.escalated) {
      await opts.hooks.emit?.({
        type: "executor.accepted",
        attempt: i + 1,
      });
      break;
    }

    await opts.hooks.emit?.({
      type: "executor.escalated",
      attempt: i + 1,
      reason: outcome.reason,
    });
  }

  const executeOutcome = {
    runState: opts.runState,
    stepsCount,
    usage: opts.cumulativeUsage,
    lastErrorMessage,
  };

  await opts.hooks.emit?.({
    type: "agent.finished",
    outcome: executeOutcome,
  });

  return executeOutcome;
}
```

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

## Acceptance

- No executor attempt or escalation-loop implementation remains in `src/inngest/functions.ts`.
- `src/lib/agents/{executor,runner}.ts` do not import Inngest or Prisma.
- Inngest still compiles and can call the extracted runner.
- Agent tests cover at least one successful path and one escalation path.
