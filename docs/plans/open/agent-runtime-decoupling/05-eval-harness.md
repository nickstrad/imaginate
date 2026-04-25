# Chunk 5: Later Eval Harness

## Goal

Reuse the decoupled runtime and event stream to build repeatable agent evaluations.

This should come after the local script proves the runtime interface is stable.

## Files

Likely additions:

- `scripts/agent-eval.ts`
- `evals/agent/*.jsonl`
- `evals/agent/README.md`

## Input Format

Start with JSONL:

```json
{"id":"small-ui-change","prompt":"Add a compact mode toggle","expect":{"files":["src/..."],"verification":"build"}}
{"id":"question-only","prompt":"Explain how project naming works","expect":{"requiresCoding":false}}
```

## Output Format

Write one JSONL result per case:

```json
{
  "id": "small-ui-change",
  "status": "success",
  "plannerTaskType": "new_feature",
  "attempts": 1,
  "verificationSuccessCount": 1,
  "filesWritten": ["src/..."],
  "durationMs": 123456
}
```

Store the raw runtime event stream separately when debugging is enabled.

## Target Integration Example

The eval harness should reuse the same runtime as Inngest and the local script:

```ts
// scripts/agent-eval.ts
for await (const testCase of readJsonl<EvalCase>(evalPath)) {
  const events: AgentRuntimeEvent[] = [];
  const sandbox = await createSandboxForCase(testCase);
  const log = createLogger({
    scope: "agent:eval",
    bindings: { caseId: testCase.id },
  });

  const hooks: AgentRuntimeHooks = {
    getSandbox: async () => sandbox,
    emit: async (event) => {
      events.push(event);
      if (debug) console.log(formatAgentEvent(event));
    },
  };

  const plan = await runPlanner({
    userPrompt: testCase.prompt,
    previousMessages: testCase.previousMessages ?? [],
    log,
    hooks,
  });

  const outcome = plan.requiresCoding
    ? await runCodingAgentWithEscalation({
        thoughts: [],
        cumulativeUsage: zeroUsage(),
        plan,
        runState: createRunState(),
        previousMessages: testCase.previousMessages ?? [],
        userPrompt: testCase.prompt,
        log,
        hooks,
      })
    : createNoCodeOutcome(plan);

  const result = scoreAgentRun({
    testCase,
    plan,
    outcome,
    events,
  });

  await appendJsonl(resultsPath, result);
}
```

Scoring can start simple:

```ts
function scoreAgentRun(input: ScoreInput): EvalResult {
  const finalOutput = input.outcome.runState.finalOutput;
  const filesWritten = Object.keys(input.outcome.runState.filesWritten);
  const verificationSuccessCount = input.outcome.runState.verification.filter(
    (v) => v.success
  ).length;

  return {
    id: input.testCase.id,
    passed:
      matchesExpectedCodingMode(input.plan, input.testCase.expect) &&
      matchesExpectedFiles(filesWritten, input.testCase.expect) &&
      matchesExpectedVerification(
        verificationSuccessCount,
        input.testCase.expect
      ),
    status: finalOutput?.status ?? "failed",
    plannerTaskType: input.plan.taskType,
    attempts: input.outcome.runState.totalAttempts,
    verificationSuccessCount,
    filesWritten,
  };
}
```

Example invocation:

```bash
npm run agent:eval -- evals/agent/smoke.jsonl --out tmp/agent-eval-results.jsonl
```

## Evaluation Modes

Useful modes:

- `planner-only`: run just `runPlanner` to tune task classification and target files.
- `executor-fake-sandbox`: use fake sandbox operations for deterministic tool tests.
- `executor-real-sandbox`: run real E2B and real models for full integration.
- `regression`: replay a fixed prompt set against the current branch.

## Acceptance

- Eval harness imports the same runtime exports as Inngest and `agent-local`.
- Cases can be run without the web app or Inngest server.
- Results include enough structure to compare runs over time.
- The harness can emit JSONL for CI or manual inspection.
