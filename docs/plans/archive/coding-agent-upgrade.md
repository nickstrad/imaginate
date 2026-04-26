# Coding agent upgrade

Reference: `coding-agent-upgrade-direct.ts` (pasted, not committed). Direct provider/model calls only — no AI Gateway. This plan describes how to fold that reference into our existing `src/inngest/functions.ts` + `agent-tools.ts` + `agent-config.ts` codebase.

## What changes, at a glance

Today we have a single-shot executor: one model, one `generateText` loop, free-form `<task_summary>` parsing, and budgets that are currently all `undefined` for the "just make it work" pass. The reference adds five layers on top of that:

1. **Planner / executor split** — a tiny pre-pass picks task type, target files, and a verification strategy before the executor runs.
2. **Diff-aware edits** — `replaceInFile` keeps occurrence-counting; new `applyPatch` for larger search/replace; `writeFiles` reserved for true rewrites/new files. Patch payload size is capped.
3. **Retry + model escalation** — three attempts: default → fallback1 → fallback2 (escalated max-output tokens on the last). Escalation is triggered by heuristics (`shouldEscalate`: empty text, "todo"/"placeholder"/"not implemented", or wrote-without-verify).
4. **Per-step budget guards** — explicit `RunBudget` (file reads, writes, terminal runs) decremented in tool execute. Replaces our current closure counters and the optional `AGENT_CONFIG.max*` knobs.
5. **Structured final output via `finalize` tool** — agent calls `finalize({ status, title, summary, verification, nextSteps })` instead of emitting `<task_summary>...</task_summary>`. Result is `FinalOutput` JSON, not a regex-parsed blob.

Plus: structured terminal results (`stdoutTruncated`/`stderrTruncated` flags + remaining-budget echoed to the model), explicit verification records (`build`/`test`/`lint`/`dev`/`command` with success bit), and a provider-error classifier that distinguishes `credit` / `rate_limit` / `auth` / `timeout` / `connection` / `unknown` with `retryable` flag.

## Mapping to our files

| Reference module                                                                                                                  | Our file(s)                           | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MODEL_REGISTRY`, `createResolvedModel`                                                                                           | `src/inngest/model-factory.ts`        | Add a `MODEL_REGISTRY` constant; today provider/model pairs come from per-message `selectedModels`. Decide: keep user selection for executor, hardcode planner+postproc to gemini-flash.                                                                                                                                                                                                                                                                                                  |
| `AGENT_LIMITS`, `RunBudget`, `createRunBudget`                                                                                    | `src/inngest/agent-config.ts`         | Replace `AGENT_CONFIG` (currently all `undefined`) with `AGENT_LIMITS` defaults + a `RunBudget` factory. Keep "undefined = infinite" escape hatch behind a flag for dev.                                                                                                                                                                                                                                                                                                                  |
| `RunState`, `VerificationRecord`, `markVerification`, `hasSuccessfulVerification`                                                 | `src/inngest/agent-config.ts`         | Extend our existing `RunState` with `verification: VerificationRecord[]`, `plan?: PlanOutput`, `finalSummary?: FinalOutput`, `totalAttempts`, `escalatedTo`. Drop ad-hoc `buildSucceeded`/`testsSucceeded`/`devStarted` booleans in favor of the verification array.                                                                                                                                                                                                                      |
| `PlanOutputSchema`, `FinalOutputSchema`                                                                                           | new: `src/inngest/agent-schemas.ts`   | New file. Already-have-zod project, drop in as-is.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `PLANNER_PROMPT`, `EXECUTOR_PROMPT`, `buildExecutorSystemPrompt`                                                                  | `src/prompts/prompts.ts`              | Add alongside existing `AGENT_PROMPT`. Existing `AGENT_PROMPT` becomes vestigial once executor prompt + plan-injection is wired.                                                                                                                                                                                                                                                                                                                                                          |
| `createAgentTools` (terminal, listFiles, readFiles, writeFiles, replaceInFile, applyPatch, runBuild, runTests, runLint, finalize) | `src/inngest/agent-tools.ts`          | Major rewrite. Today: `createTerminalTool`, `createReadFilesTool`, `createCreateFilesTool`, `createReplaceInFileTool`, `createListFilesTool`, `computeIsError`. Migrate signatures to take `{ getSandbox, runState, budget }`. Add `applyPatch`, `runBuild`, `runTests`, `runLint`, `finalize`. Drop `computeIsError` (replaced by `isFinalOutputAcceptable`). Replace the `TSC_VERIFY` regex with explicit `runBuild`/`runTests`/`runLint` tools that record verification rows directly. |
| `runPlanner`, `runExecutorOnce`, `runCodingAgentWithEscalation`                                                                   | `src/inngest/functions.ts`            | The big change. Replace the single `generateText` call (currently at `functions.ts:191`) with: `runPlanner` (in its own `step.run("plan")`) → `runCodingAgentWithEscalation` (the executor loop, in `step.run("execute")`). The escalation loop calls `generateText` up to 3 times.                                                                                                                                                                                                       |
| `extractTelemetry` (reference version)                                                                                            | `src/inngest/agent-telemetry.ts`      | Extend our current telemetry to include `plannerTaskType`, `totalAttempts`, `escalatedTo`, `verificationSuccessCount`, `verificationFailureCount`.                                                                                                                                                                                                                                                                                                                                        |
| `classifyProviderError`                                                                                                           | new: `src/inngest/provider-errors.ts` | New file. Hook into the existing `try/catch` around `generateText` in `functions.ts` (currently labels all failures `provider error`).                                                                                                                                                                                                                                                                                                                                                    |

## Concrete migration steps

### Phase 1 — schemas + plan/exec scaffolding (no behavior change yet)

1. Add `PlanOutputSchema`, `FinalOutputSchema` in `src/inngest/agent-schemas.ts`.
2. Add `PLANNER_PROMPT`, `EXECUTOR_PROMPT`, `buildExecutorSystemPrompt` to `prompts.ts`.
3. Add `MODEL_REGISTRY` to `model-factory.ts`. Decide planner = `gemini-2.5-flash-lite` (already used for project naming; cheap + fast).
4. Add `RunBudget` and `createRunBudget` alongside `AGENT_CONFIG`. Don't remove the existing config yet.

### Phase 2 — tool layer rewrite

5. Refactor `agent-tools.ts` to accept `{ getSandbox, runState, budget }` instead of `{ sandboxId, runState }`. Pass `getSandbox: () => getSandbox(sandboxId)` from `functions.ts`.
6. Add `applyPatch`, `runBuild`, `runTests`, `runLint`, `finalize`.
7. Replace closure counters (`runCount`, `readCount`) with `budget.terminalRunsRemaining--` / `budget.fileReadsRemaining -= files.length`. Echo remaining budgets in tool results so the model can self-pace.
8. Add `markVerification` calls in `terminal` (heuristic on command), `runBuild`, `runTests`, `runLint`. Drop the `TSC_VERIFY` regex.
9. Delete `computeIsError`; replace its only caller in `functions.ts` with the new `isFinalOutputAcceptable(finalOutput, runState)` check.

### Phase 3 — orchestrator

10. Wrap the new flow in Inngest steps:
    - `step.run("plan", () => runPlanner(...))` — small budget, one call.
    - `step.run("execute", () => runCodingAgentWithEscalation(...))` — wraps the whole 1-3 attempt executor loop. Note: this _single_ step contains the escalation loop, so a function-level retry won't re-run the planner or earlier sandbox setup.
11. Replace the current `<task_summary>` regex parsing in `functions.ts` with `result.finalOutput` consumed directly. `finalOutput.title` → `fragmentTitle` field; `finalOutput.summary` → response text. (`fragment-title` and `response-text` postproc steps may become unnecessary — `finalize` can return them directly. Decide based on whether the user-facing tone needs a separate model pass.)
12. In the `try/catch` around `generateText`, route errors through `classifyProviderError`. Use `retryable` to decide whether to skip to the next escalation attempt vs. abort with a user-visible "credit/auth" error.

### Phase 4 — telemetry + cleanup

13. Extend `extractTelemetry` to include the planner/escalation/verification counts.
14. Remove vestigial fields from `RunState` (`buildSucceeded`, `testsSucceeded`, `devStarted`, `summaryProduced`) — superseded by `verification[]`.
15. Remove the `<task_summary>` stop predicate from `stopWhen`. The new stop predicate is `last.text.includes('"status"')` (since `finalize` returns JSON containing `"status"`).
16. Delete `coding-agent-upgrade-direct.ts` reference dump once everything is migrated.

## Open questions / decisions

- **Should the executor use the user's `selectedModels` or `MODEL_REGISTRY`?** The reference hardcodes the registry. We currently let users pick per provider. Likely: keep user selection for `executorDefault`, fall back to registry for `executorFallback1`/`2`.
- **Postproc model.** Reference uses `MODEL_REGISTRY.postprocess` only as a label, never invokes it (because `finalize` produces the title/summary directly). We currently run two extra `generateText` calls (`fragment-title`, `response-text`) on `summary`. Decision needed: drop those calls (faster, cheaper, but final wording is whatever the executor produced) vs. keep them (extra polish, ~300ms latency).
- **`finalize` tool vs. `<task_summary>`.** `finalize` is structurally cleaner but means we lose the current behavior where the summary tag also acts as the loop's stop signal organically. Need to confirm executor models reliably call `finalize` — early Anthropic/Gemini behavior here can be flaky.
- **Sandbox lifetime.** Adding planner + escalation could push run time past `SANDBOX_TIMEOUT` (now 30 min). Worth raising again or, better, making `getSandbox` re-touch the timeout on every call (it already does — verify).
- **Plan-mode skip.** If `plan.requiresCoding === false`, the reference returns a canned "no code changes needed" `FinalOutput` and never spins up the executor or sandbox. We should short-circuit `get-sandbox-id` in that case to save the e2b cold-start.

## Risk / scope

- Touches every file in `src/inngest/`. ~600 lines of new code, ~300 lines deleted.
- Tool signatures change → if other code (`askAgent`, scripts) uses these tools, they need updates.
- The biggest behavior change is "agent must call `finalize`" — if the prompt isn't strong enough, runs will hang on the stop predicate and be marked `partial` by the fallback. Worth A/B-ing the planner+escalation branch against `main` on a fixed prompt set before cutting over.
