# Planner complexity routing

## Goal

Have the planner emit a `complexity: "trivial" | "standard"` field, and use that field to pick the executor's primary model: Haiku 4.5 for trivial, Sonnet 4.6 for standard. Most user prompts in this vibe-coding app are small text/style tweaks where Haiku is fine; the costly minority (interactive UI logic, multi-file features) need Sonnet to land on the first try. Routing on a planner-emitted signal keeps Sonnet usage bounded to the runs that actually need it, instead of paying Sonnet rates on every trivial copy edit.

## The problem

Today the executor model is a single env-driven default with a fixed fallback ladder (`src/platform/models/constants.ts:21`). The current default is Haiku 4.5 (`src/platform/config/env.ts:21`). Two failure modes follow:

- **Quality floor too low.** Haiku reliably writes "looks plausible, doesn't work" UI for anything with state/event logic — the recent tic-tac-toe and hangman regressions are textbook examples. Bumping the default to Sonnet fixes quality but ~3×s the per-run cost on tasks Haiku already handles.
- **No signal to discriminate.** `executeRun` walks `EXECUTOR_LADDER` only on retryable failure (`src/agent/application/run-agent.ts:60`). There is no path that picks a different rung for an _easier_ task — every run starts at the same rung regardless of complexity.

The planner already emits structured guidance the executor reads (`taskType`, `verification`, `notes`) via `PlanOutputSchema` (`src/agent/domain/schemas.ts:16`). Adding a complexity dimension is a natural extension of that surface — the planner is already deciding "how hard is this?" implicitly when it picks `verification`.

## What "after" looks like

### Schema

`src/agent/domain/schemas.ts`:

```ts
export const PlanComplexitySchema = z.enum(["trivial", "standard"]);
export type PlanComplexity = z.infer<typeof PlanComplexitySchema>;

export const PlanOutputSchema = z.object({
  requiresCoding: z.boolean(),
  taskType: PlanTaskTypeSchema,
  complexity: PlanComplexitySchema.default("standard"),  // NEW
  targetFiles: z.array(z.string()).default([]),
  verification: z.enum([...]).default("tsc"),
  notes: z.string().default(""),
  answer: z.string().optional(),
});
```

`DEFAULT_PLAN` in `src/agent/application/plan-run.ts` gets `complexity: "standard"` so missing-planner runs fall back to the safer (more capable) model.

### Planner prompt guidance

`src/shared/prompts/planner.ts` adds:

```
- complexity: "trivial" or "standard".
  - "trivial" — text/copy changes, color/spacing/styling tweaks, swapping a label or icon, renaming a variable, single-line edits, content updates with no new logic.
  - "standard" — anything with state, events, conditionals, new components, multi-file changes, game logic, forms, data fetching, anything interactive. When in doubt, choose "standard".
```

### Routing

`src/platform/models/constants.ts` gains a complexity-keyed map:

```ts
export const EXECUTOR_BY_COMPLEXITY = {
  trivial: MODEL_REGISTRY.executorTrivial, // CLAUDE_HAIKU_4_5
  standard: MODEL_REGISTRY.executorStandard, // CLAUDE_SONNET_4_6
} satisfies Record<PlanComplexity, ModelSpec>;
```

The `executorDefault` slot is renamed `executorStandard` and a new `executorTrivial` slot is added, both env-driven. Defaults:

```
MODEL_EXECUTOR_TRIVIAL=anthropic/claude-haiku-4.5
MODEL_EXECUTOR_STANDARD=anthropic/claude-sonnet-4.6
MODEL_EXECUTOR_FALLBACK_1=openai/gpt-5-mini
MODEL_EXECUTOR_FALLBACK_2=google/gemini-3-flash-preview
```

The fallback rungs stay shared — they are the "everything failed, try someone else" path, not the complexity path.

### Ladder resolution

`ModelGateway.listExecutorModelIds()` becomes complexity-aware. Either:

```ts
listExecutorModelIds(complexity: PlanComplexity): string[]
```

returning `[bycomplexity[c], fallback1, fallback2]`, or a new method `resolveExecutorLadder(complexity)`. `run-agent.ts:60` passes `plan.complexity` when asking for the ladder.

### Telemetry

`AgentRuntimeEventType.ExecutorAttemptStarted` already carries `model`. Add `complexity` to `PlannerFinished` (already carries the full plan, so this is free once the schema lands) and surface it on the run summary so we can measure "% trivial" and "Haiku success rate on trivial."

## Sequencing

One PR is enough. Order within the PR:

1. **Schema + default plan** — add `complexity` to `PlanOutputSchema`, set `DEFAULT_PLAN.complexity = "standard"`. Update `planSnippet` to include it so the executor system prompt sees it. Add unit coverage in `src/agent/domain/schemas` test (if present) or a focused parse test.
2. **Planner prompt** — add the bullet to `PLANNER_PROMPT` with the two definitions and the "when in doubt, standard" tiebreaker.
3. **Env + registry** — split `MODEL_EXECUTOR_DEFAULT` into `MODEL_EXECUTOR_TRIVIAL` (Haiku) and `MODEL_EXECUTOR_STANDARD` (Sonnet) in `src/platform/config/env.ts`. Update `MODEL_REGISTRY` and `MODEL_ROUTES` in `src/platform/models/constants.ts`. Update `src/platform/config/env.test.ts` defaults.
4. **Gateway API** — change `listExecutorModelIds` (or add `resolveExecutorLadder`) on the `ModelGateway` port and ai-sdk adapter. Update the in-memory test gateway under `src/agent/testing/`.
5. **Wire through run-agent** — pass `plan.complexity` to the gateway in `src/agent/application/run-agent.ts:60`. Add a test in `src/agent/testing/run-agent.test.ts` that asserts a trivial plan starts on the trivial model and a standard plan on the standard model.
6. **Docs** — update `src/shared/config/AGENTS.md` env list and any reference to "executor default" to call out the trivial/standard split.

## Definition of done / Verification

- `PlanOutputSchema` parses `{ complexity: "trivial" }` and defaults missing values to `"standard"`. Unit test.
- Planner prompt change produces `complexity` on real runs. Manual smoke: run a "change the heading to 'Hi'" prompt and a "build a tic-tac-toe game" prompt; assert the planner picks `trivial` and `standard` respectively (visible in `PlannerFinished` event payload / inngest logs).
- `run-agent.test.ts` covers both routing branches.
- `npx tsc --noEmit` and `npm test` pass.
- Per `docs/testing/AGENTS.md`: the new behavior is exercised by an in-memory agent run (no real network), not just schema unit tests.
- Cost telemetry: a week after rollout, eyeball the inngest logs and confirm trivial-routed runs are a meaningful fraction (target: >40% of coding runs). If essentially everything is `standard`, the planner prompt needs tuning, not the routing.

## Out of scope

- Multi-tier complexity (`trivial | standard | hard`). Two tiers covers the cost/quality split; a third tier is premature until we see Sonnet failing in measurable volume.
- Per-task-type routing (e.g. always send `bug_fix` to Sonnet). Complexity is the more general signal; revisit if evidence shows `taskType` predicts quality better.
- Auto-escalation: "Haiku failed verification → retry on Sonnet." The existing fallback ladder already escalates on retryable provider errors. Quality-based escalation (build passed but UI is broken) requires a feedback signal we don't have yet — separate plan if we want it.
- Routing the planner itself. Planner stays on Gemini Flash Lite — it only emits a structured tool call and is the cheapest part of the run.
- Tracking actual $ per run. Useful eventually, but not required to validate routing works.

## Dependencies & conflicts

- **Coordinates with `agent-telemetry-refactor`** — that plan is already adding model and outcome dimensions to the run summary (`02-outcome-and-model-dimensions.md`). The new `complexity` field is another natural dimension; whichever plan lands second should add `complexity` to the summary schema rather than introducing a parallel surface. Boundary: this plan owns the planner→executor routing; the telemetry plan owns the summary shape.
- **No conflict with `agent-harness-transport-agnostic`** — that plan reshapes events/errors at the transport layer; `PlanOutput` content is orthogonal.
- **No conflict with `cli-local-sandbox` or `sandbox-auto-revive`** — both are sandbox-layer plans and don't touch model selection.
- No related plans in `drift/`.
