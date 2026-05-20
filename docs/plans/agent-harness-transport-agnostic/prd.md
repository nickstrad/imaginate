# Agent harness — transport-agnostic core

## Problem statement

`src/agent` ships a "reusable" runtime that two transports actually use today — Inngest (`src/interfaces/inngest/functions.ts`) and the local CLI (`src/interfaces/cli/agent-local.ts`) — but the harness leaks transport identity and does not give either transport the seams it needs. Inngest re-implements the executor ladder loop inline at `src/interfaces/inngest/functions.ts:241-414` because `runAgent` doesn't expose the per-phase durability hooks `step.run` requires; the CLI synthesizes a fake `projectId: "local"` (`src/interfaces/cli/agent-local.ts:578`) to satisfy `MessageStore` / `TelemetryStore` ports that key by web-app identifiers; the executor ladder is duplicated across `src/agent/application/run-agent.ts:90-174` and the Inngest fork; sandbox lifecycle is owned by callers (CLI's keepalive hang, Inngest's eager creation). The duplication is silent drift waiting to happen and the leaked identity makes new transports (Slack, evals, future tooling) impossible to add without forking the loop again.

## Proposed solution

Reshape `src/agent` into a substrate (ports, domain types, the ladder primitive, hook contracts) plus N orchestration functions that compose it. Plan→executor becomes one orchestration named `runPlanExecutor`; future one-shot or multi-agent flows are siblings, not strategies on a single configurable engine. Transports inject durability cross-cuttingly through a `wrapPhase<T>(name, fn)` hook the orchestration calls around its named phases (`"plan"`, `"acquire-workspace"`, `"execute"`, `"finalize"`); side effects attach through narrow named hooks (`onAnswerOnly`, layered `ladder.*` hooks). Every web-shaped identifier (`projectId`, `messageId`, `MessageStore`, `lastErrorMessage`, harness-invented `runId`) is removed from core; telemetry is keyed by an opaque `turnKey`; loggers are pre-scoped by the transport. Workspace lifecycle splits into a transport-owned durable `Workspace` (kind + id + `acquireSession`) and a harness-owned ephemeral `WorkspaceSession` (`commands` / `files` / `close`) closed deterministically in `finalize`. `AbortSignal` is threaded through every layer as an optional parameter so a future cancellation/pause/steering plan adds activation in one place per transport, not another sweep through the harness. The whole change lands as one atomic PR with staged commits, gated on offline snapshot parity tests with stub adapters.

## User stories

- **As an Inngest function author**, I want to call one harness function with a `wrapPhase` hook backed by `step.run`, so that I can delete the inline ladder loop and trust the harness to own phase ordering.
- **As a CLI user**, I want non-coding answers to skip sandbox creation entirely, so that I don't pay e2b provisioning cost on a one-line question.
- **As a CLI user**, I want the process to exit cleanly after `run.finished`, so that I don't sit through a ~minute keepalive hang because nobody closed the sandbox session.
- **As a future transport author (Slack, eval harness)**, I want to wire a new surface by writing one `WorkspaceProvider` adapter and supplying hooks, so that I never edit `src/agent/`.
- **As a future orchestration author (one-shot, multi-agent)**, I want to compose `executeWithLadder` and the same hook substrate as `runPlanExecutor`, so that I get model-fallback for free without copying the ladder.
- **As a CLI maintainer running a local model**, I want a length-1 ladder to work as the degenerate case, so that single-model setups don't need orchestration changes.
- **As a reviewer**, I want offline snapshot tests of the harness's event stream to gate the merge, so that "behavior parity" is mechanically verified rather than asserted.
- **As a future cancellation/pause feature author**, I want every layer to already accept `signal?: AbortSignal`, so that activating cancellation is a transport-side patch, not another harness sweep.

## Modules to modify

### Add

- `src/agent/application/run-plan-executor.ts` — new orchestration entrypoint; owns phase ordering (`plan` → branch on `requiresCoding` → `acquire-workspace` → `execute` → `finalize`); calls the ladder primitive; returns a discriminated `kind: "answered" | "executed" | "failed"` result.
- `src/agent/application/execute-with-ladder.ts` — extracted ladder primitive; loops attempts, classifies errors, fires layered ladder hooks. Reusable across orchestrations.
- `src/agent/application/runtime-hooks.ts` — `WrapPhase`, `LadderHooks`, and `RunPlanExecutorHooks` type definitions. `wrapPhase` signature: `<T>(phase: PlanExecutorPhase, fn: () => Promise<T>) => Promise<T>`.
- `src/agent/application/run-plan-executor.parity.test.ts` — three snapshot fixtures (one per result kind) using stub adapters; offline, deterministic.
- `src/interfaces/inngest/functions.parity.test.ts` — stub `step.run` records phase IDs; asserts the same step boundaries Inngest depends on today still fire.

### Change

- `src/agent/application/run-agent.ts` — deleted in the final cleanup commit; intermediate commits keep it alongside while transports migrate.
- `src/agent/application/run-agent-deps.ts` → `src/agent/application/agent-runtime-deps.ts` — drop `messageStore` field; `telemetryStore` moves out into optional `persistence?: { telemetryStore; turnKey }` on `RunPlanExecutorArgs`.
- `src/agent/application/execute-run.ts` — accepts `signal?: AbortSignal`; `persistTelemetrySnapshot` continues to fire per-step but now keyed by `turnKey`, not `messageId`.
- `src/agent/domain/types.ts` — `AgentRunInput`: drop `projectId`. `AgentRunResult` replaced by `RunPlanExecutorResult` discriminated union; `lastErrorMessage` removed.
- `src/agent/domain/events.ts` — `AgentFinished` event drops `lastErrorMessage` field; everything else stays byte-identical.
- `src/agent/ports/telemetry-store.ts` — `upsert({ messageId, summary })` → `upsert({ turnKey, summary })`.
- `src/agent/ports/workspace.ts` — add `kind: "remote" | "local" | "readonly"` and `acquireSession(): Promise<WorkspaceSession>`. `WorkspaceSession` defines `commands.run`, `files.read/write`, `close()`. `commands.run` accepts `signal?: AbortSignal`.
- `src/agent/ports/model-gateway.ts` — `generate*` methods accept `signal?: AbortSignal`.
- `src/agent/ports/index.ts` — drop `MessageStore` re-export.
- `src/agent/index.ts` — export `runPlanExecutor`, `executeWithLadder`, `WorkspaceSession`, hook types; drop `runAgent` and `MessageStore`.
- `src/interfaces/inngest/functions.ts` — replace inline ladder (lines 232-414) with one `runPlanExecutor` call; supply `wrapPhase: (name, fn) => step.run(name, fn)`, `onAnswerOnly` (saves answer + telemetry as two `step.run` calls), `ladder.onEscalate` (stub-language detector), `ladder.onLadderExhausted` (warn log). After return, branch on `result.kind` for `saveSuccess` / `saveProviderError`. Sandbox URL extraction stays where it is — outside the harness.
- `src/interfaces/inngest/agent-adapter.ts` — `buildAgentDeps` no longer constructs a `messageStore`; `telemetryStore` moves out of deps construction (passed via `persistence` on the call).
- `src/interfaces/cli/agent-local.ts` — drop `projectId: "local"`, drop `messageStore: createInMemoryMessageStore()`, drop manual `runId` derivation; supply pre-scoped logger; drop `lastErrorMessage` reads (use `result.error.message`); read `result.workspace?.id` for sandbox URL printing instead of pre-call `sandboxId` plumbing.

### Delete

- `src/agent/ports/message-store.ts` — port deleted entirely.
- `src/agent/testing/in-memory-message-store.ts` (if exists) and `createInMemoryMessageStore` export — dead with the port.
- All references to `lastErrorMessage` across `src/agent/` and both transports.
- `projectId` field on `AgentRunInput`; `runId` default in `runAgent` (gone with `runAgent`).

### Architecture contract update (same PR)

- `docs/architecture/architecture.md` — `Workspace` port section (lines 33-42) updated to document `kind` + `acquireSession` + the `Workspace` / `WorkspaceSession` lifecycle split. The "Key invariants" subsection gains: _"`src/agent/` contains no transport-specific identifiers (`projectId`, `messageId`, `runId`); orchestrations accept opaque `turnKey` only."_

## Implementation decisions

Locked during the grill, in order:

1. **Scope is decoupling, not full Phase C.** Goals from the archived plan are still accurate; this revival narrows to the parts that fully decouple the harness. Pause/resume, steering, tool-call gates, agent sessions, and pluggable tools are out of scope (see _Out of scope_).
2. **Substrate plus N orchestrations, not one configurable engine.** `src/agent/` exposes a substrate (ports, domain, ladder primitive, hook contracts) and orchestration functions like `runPlanExecutor`. Future one-shot / multi-agent flows are siblings, not `strategy:` parameters on a single engine.
3. **Durability via `wrapPhase<T>(name, fn) => Promise<T>` hook.** Single entrypoint per orchestration; transports inject durability cross-cuttingly. No split-functions (`planAgent` + `executeAgent`), because that pushes orchestration back into transports.
4. **Phase vocabulary for `runPlanExecutor`:** `"plan"`, `"acquire-workspace"`, `"execute"`, `"finalize"`. `execute` wraps the _whole ladder loop_ as one durable unit (per-attempt wrapping would let Inngest replay individual rungs against mutated sandbox state — a correctness bug). `acquire-workspace` runs lazily, only when `plan.requiresCoding === true`.
5. **Answer-only path is a hook, not a phase.** `onAnswerOnly({ answer, plan, usage })`; the transport closes over `step` and calls its own `step.run("save-answer-only", …)` and `step.run("save-telemetry", …)`. Rule: _phases = harness-internal control-flow boundaries; hooks = observation points for transports._
6. **Terminal-error handling is post-return, no hook.** Transport branches on `result.kind === "failed"` and reads `result.error.message`. Adding `onTerminalError` would force nested `step.run` inside `wrapPhase("finalize")` (illegal in Inngest) and split branching across two places.
7. **Ladder is a substrate primitive (`executeWithLadder`).** Lives where any orchestration can compose it. Length-1 ladders work for single-model / local-model setups — the for-loop runs once with no escalation.
8. **Layered hook surface:**
   ```ts
   interface RunPlanExecutorHooks {
     wrapPhase?<T>(phase: PlanExecutorPhase, fn: () => Promise<T>): Promise<T>;
     onAnswerOnly?(args: {
       answer: string;
       plan: Plan;
       usage: UsageTotals;
     }): Promise<void> | void;
     ladder?: LadderHooks;
   }
   interface LadderHooks {
     onAttemptStart?(args: {
       attempt: number;
       model: ModelDescriptor;
     }): Promise<void> | void;
     onAttemptFinish?(args: {
       attempt: number;
       outcome: ExecutorOutcome;
     }): Promise<void> | void;
     onEscalate?(args: {
       attempt: number;
       reason: string;
       runStateSnapshot: RunStateSnapshot;
     }): Promise<void> | void;
     onLadderExhausted?(args: {
       escalations: Escalation[];
       stepsCount: number;
     }): Promise<void> | void;
   }
   ```
   Future orchestrations that compose the ladder accept `LadderHooks` under the same `ladder` key.
9. **Hook error policy.** `wrapPhase` and `onAnswerOnly` are awaited and propagate (control flow). All four `ladder.*` hooks are awaited but exceptions are caught, logged via `deps.logger`, and swallowed (observation). One internal `safelyInvoke(hook, args, logger)` helper enforces the swallow path for ladder hooks.
10. **AbortSignal is threaded-but-optional.** Every layer accepts `signal?: AbortSignal` (`RunPlanExecutorArgs`, `executeWithLadder`, `executeRun`, `ModelGateway.generate*`, `WorkspaceSession.commands.run`). No transport passes one yet, so behavior is identical. Activation by future plans is a transport-side patch.
11. **Workspace lifecycle:** transport owns durable `Workspace` (`kind`, `id`, `acquireSession`); harness owns ephemeral `WorkspaceSession` (`commands`, `files`, `close`). Harness opens session in `acquire-workspace` phase, closes in `finalize`. Fixes CLI's keepalive hang and CLI's eager-provisioning bug at once.
12. **`PreviewProvider` is a separate optional port the transport calls itself, post-run.** Harness has zero preview/URL knowledge. Inngest's existing `getSandbox` / `ensurePreviewReady` / `getSandboxUrl` flow stays put, just relocated outside the `runPlanExecutor` call.
13. **No transport identifiers in core.** `projectId` deleted from `AgentRunInput`; no harness-invented `runId`; `MessageStore` deleted; telemetry keyed by opaque `turnKey: string` only. Logger is pre-scoped by the transport — harness never calls `logger.child(…)`.
14. **Result is a discriminated union.**
    ```ts
    type RunPlanExecutorResult =
      | { kind: "answered"; answer: string; plan: Plan; usage: UsageTotals }
      | {
          kind: "executed";
          finalOutput: FinalOutput;
          runState: RunState;
          stepsCount: number;
          usage: UsageTotals;
          workspace: { kind: WorkspaceKind; id: string };
        }
      | {
          kind: "failed";
          error: AgentError;
          runState: RunState;
          stepsCount: number;
          usage: UsageTotals;
          workspace?: { kind: WorkspaceKind; id: string };
        };
    ```
    `workspace` is required on `executed`, optional on `failed` (failure may precede acquisition), absent on `answered`. `lastErrorMessage` is gone — `error.message` carries it structurally.
15. **Atomic PR with staged commits.** Recommended commit order, each individually compiling:
    1. Add `executeWithLadder` primitive + `LadderHooks` (no callers yet).
    2. Add `runPlanExecutor` alongside `runAgent`, calling the new primitive.
    3. Migrate Inngest from inline ladder → `runPlanExecutor`.
    4. Migrate CLI from `runAgent` → `runPlanExecutor`; drop `projectId: "local"`.
    5. Delete `runAgent`, `MessageStore`, `lastErrorMessage`, `projectId`; update `docs/architecture/architecture.md`.
       No deprecation window, no parallel exports.
16. **Parity proof: offline snapshot tests with stub adapters.** Three fixtures (one per result kind) for the harness; mirror at the Inngest transport with a stub `step.run` that records phase IDs. Stub `ModelGateway`, `WorkspaceProvider`, `ToolFactory`, `EventSink`, `Logger`, `TelemetryStore` — no network, no LLM, no sandbox. Expected diff vs. `main`: only the `lastErrorMessage` deletion from the `agent.finished` event payload and result object. Anything else in the diff is out-of-scope drift and gates the merge.

## Out of scope

Explicitly deferred or refused during the grill — surface here so future sessions don't pull them in:

- **`PauseController` / cooperative pause+resume at step boundaries.** Different lifecycle from `AbortSignal`; needs its own design.
- **Steering / `resumeWith({ additionalUserMessage })` mid-run message injection.** Orchestration-level concern; needs its own hook between attempts.
- **`toolCallGate` per-tool approval.** Separate primitive; suspends inside a step, not at boundaries.
- **`createAgentSession` warm multi-turn for CLI Ink / Slack threads.** Out of scope; future plan composes the substrate this PR ships.
- **Pluggable tools (`createExecutorTools({ extraTools, restrictTo, wrap })`).** Future plan.
- **Replacing Inngest with another orchestrator.**
- **Reordering or restructuring the executor ladder model strategy** (escalation heuristic stays as-is).
- **Building the CLI Ink app or a Slack adapter.** Both consume this refactor; neither is delivered here.
- **Telemetry schema changes.** Owned by `observability-data-planes`.
- **Local-workspace sandbox hardening.** Owned by `cli-local-sandbox`.
- **AbortSignal _activation_** (CLI Ctrl-C handler, Inngest platform-abort forwarding). This PR adds the parameter throughout; no transport passes one yet.
- **`MessageStore` replacement.** The port is deleted; no transport-neutral message storage abstraction replaces it. Transports that want history persist messages themselves (Inngest already does via `messageWorkflow`; CLI doesn't need it).

## Open questions

- **Folder placement of `executeWithLadder`.** The grill called it a "substrate primitive" and floated `src/agent/primitives/`, but the architecture contract today only lists `domain / application / ports / adapters / testing` under `src/agent/`. Two viable options: (a) keep it in `src/agent/application/execute-with-ladder.ts` (dependency rules are identical to other application code; no architecture-doc change needed), or (b) introduce `src/agent/primitives/` as a new sibling and update `docs/architecture/architecture.md` + the lint config in the same PR. Pick during ticketing.
- **Phase name `"acquire-workspace"` durability key.** Inngest currently uses `"get-sandbox-id"` as the `step.run` ID for sandbox creation. Renaming the durable step ID invalidates in-flight runs at deploy. Decide whether to (a) keep the legacy ID by having Inngest's `wrapPhase` map `"acquire-workspace" → step.run("get-sandbox-id", …)`, or (b) accept a one-time replay break for in-flight runs at deploy.
- **Whether `Workspace.kind` includes `"readonly"` in this PR.** The grilled type union was `"remote" | "local" | "readonly"` but no current adapter is read-only; can ship as `"remote" | "local"` and add `"readonly"` when the first read-only transport materializes.
