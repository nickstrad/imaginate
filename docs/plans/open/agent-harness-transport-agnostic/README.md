# Agent harness: transport-agnostic core

## Goal

Refactor `src/agent` so the same harness powers the web app (Inngest), the CLI (Ink coding agent), and future transports (Slack, evals, internal tooling) without each one forking the loop, faking identifiers, or losing structured information. The end state is a small, neutral core (`runAgent` / `AgentSession` / events / ports) plus thin transport adapters that compose it.

This is a refactor, not a feature. Behavior parity with today is the bar; the win is removing duplicated logic in `src/interfaces/inngest/functions.ts`, removing dead-port DI, and unblocking the CLI and Slack transports planned in `cli-ink-app/` and elsewhere.

## The problem

Concrete leaks today (all `file:line`):

- **Loop is duplicated.** `src/agent/application/run-agent.ts:67-147` runs the executor ladder. `src/interfaces/inngest/functions.ts:203-283` re-implements the same ladder because it needs per-step persistence hooks `runAgent` doesn't expose.
- **Errors are lossy.** `run-agent.ts:151` collapses failures to `lastErrorMessage: string | null`; `AgentRunResult` has no structured error. Inngest re-classifies (`functions.ts:311`, `:454`) to recover the category.
- **Dead ports.** `MessageStore` is in `AgentRuntimeDeps` (`run-agent-deps.ts:15`) but never read in the harness. `TelemetryStore` is required but only used when `persistTelemetryFor` is set.
- **Web identity in core ports.** `MessageStore` requires `projectId` (`ports/message-store.ts:8`); `TelemetryStore` keys by `messageId`. CLI fakes `projectId: "local"` (`agent-local.ts:529`); Slack would have to invent a synthetic project per channel.
- **No interrupts, no tool-call gate.** `execute-run.ts:96-212` cannot be cancelled mid-step and offers no approval hook.
- **No session.** Every `runAgent` call cold-starts tool factory, model client wiring, and (in some cases) sandbox.
- **Sandbox is named for one use case.** `SandboxGateway` is neutral in shape but the name + `getHost` carry "remote sandbox with preview URL" connotations. CLI special-cases `sandboxId: "local"`.
- **Events lose structured tool results.** `ExecutorStepFinished.toolResults: string[]` is pre-stringified; downstream renderers can't show structured success/failure cleanly.

The architecture contract already supports the fix: pure use cases in `src/agent/application`, ports in `src/agent/ports`, adapters in `src/agent/adapters`, transports in `src/interfaces/*`. This plan tightens those seams.

## What "after" looks like

A neutral core:

```ts
// src/agent/application/run-agent.ts
export async function runAgent(args: {
  input: AgentRunInput;
  deps: AgentRuntimeDeps; // narrowed: no message/telemetry stores
  config: AgentRuntimeConfig;
  signal?: AbortSignal;
  persistence?: { telemetryStore: TelemetryStore; turnKey: string };
  hooks?: AgentRuntimeHooks; // optional ladder hooks
}): Promise<AgentRunResult>; // includes runState + classified error
```

A reusable session for multi-turn transports:

```ts
// src/agent/application/agent-session.ts
export function createAgentSession(args: {
  deps: AgentRuntimeDeps;
  workspace: Workspace;
  conversationKey: string;
}): AgentSession;

interface AgentSession {
  runTurn(
    prompt: string,
    opts?: {
      previousMessages?: AgentMessage[];
      signal?: AbortSignal;
      persistence?: { telemetryStore: TelemetryStore; turnKey: string };
    }
  ): Promise<AgentRunResult>;
  close(): Promise<void>;
}
```

A single ladder that both `runAgent` and Inngest call:

```ts
// src/agent/application/execute-with-ladder.ts
export async function executeWithLadder(args: {
  input;
  deps;
  config;
  signal;
  hooks: { onAttemptStart?; onAttemptFinish?; onEscalate?; onStepFinish? };
}): Promise<LadderOutcome>;
```

Ports stop carrying transport identity:

```ts
// src/agent/ports/telemetry-store.ts
upsert(args: { turnKey: string; summary: RunTelemetrySummary }): Promise<void>;
// MessageStore is removed from src/agent/ports entirely.
```

Workspace replaces `SandboxGateway`:

```ts
// src/agent/ports/workspace.ts
interface Workspace {
  kind: "remote" | "local" | "readonly";
  id: string;                                // opaque
  commands: { run(...) };
  files: { read(...); write(...) };
  acquireSession(): Promise<WorkspaceSession>;
}
// Preview-URL formatting moves to a separate optional PreviewProvider.
```

## Chunk index

Three phases, ordered. Phase A is additive (no breaking changes). Phase B is interface cleanup (Inngest deletes its forked loop). Phase C adds new capabilities required by CLI/Slack.

**Per `docs/plans/AGENTS.md`, only the next two chunks have files. Later chunks are one-line stubs and get promoted to full files when they become the next-to-implement.**

**Phase A — additive, no breaking changes**

2. [`02-error-taxonomy.md`](02-error-taxonomy.md) — Promote `classifyProviderError` into `domain/errors.ts`; emit structured `AgentError` on failure events and `AgentRunResult.error`. _(current chunk, full detail)_
3. [`03-richer-events.md`](03-richer-events.md) — Add `tool.call.requested` / `tool.call.completed` with structured args + results. Make `executor.step.finished` authoritative via `toolCallIds`. _(N+1, lighter detail)_

**Phase B — interface cleanup**

4. `04-extract-execute-with-ladder` — Pull the ladder into `execute-with-ladder.ts` with hook callbacks. `runAgent` becomes a thin wrapper. Inngest deletes its fork.
5. `05-narrow-deps` — Remove `MessageStore` from `AgentRuntimeDeps`. Move `TelemetryStore` into `persistence?: { ... }`. Drop `projectId` / `messageId` from core ports; replace with opaque `turnKey` / `conversationKey`. Removes deprecated `lastErrorMessage`.

**Phase C — new capabilities for non-web transports**

6. `06-cancel-and-gate` — Thread `AbortSignal` through `runAgent` → model gateway → sandbox commands. Add optional `toolCallGate` on `ToolFactory`.
7. `07-pluggable-tools` — `createExecutorTools({ extraTools?, restrictTo?, wrap? })`.
8. `08-agent-session` — Introduce `createAgentSession` for warm multi-turn (CLI Ink, Slack threads).
9. `09-workspace-rename` — Rename `SandboxGateway` → `Workspace`, add `kind` and `acquireSession`. Move preview-URL formatting to a separate optional `PreviewProvider` port. Two CLI bugs the new lifecycle should fix: (a) `agent-local` provisions the e2b sandbox eagerly before the planner runs, so non-coding answers still pay full sandbox-creation cost — `acquireSession` must be lazy (only on first executor tool use); (b) `WorkspaceSession.close()` must be wired into the CLI to end the ~minute keepalive hang where the process blocks after `run.finished` because the e2b connection is never disposed.

Phases gate each other: Phase A must land before Phase B (the ladder extraction depends on `runAgent` already returning structured state and errors). Phase C must wait for Phase B (it composes the narrowed deps and the extracted ladder).

## Definition of done

- `src/interfaces/inngest/functions.ts` no longer contains its own ladder; it calls `executeWithLadder` (or `runAgent`) and supplies persistence hooks.
- The CLI does not synthesize fake `projectId` strings to satisfy core ports.
- A new transport can be wired by implementing `Workspace`, providing event/persistence hooks, and calling `createAgentSession` — no need to fork loops, ports, or error taxonomies.
- `runAgent` can be cancelled with `AbortSignal`; in-flight model and sandbox calls observe the signal.
- A tool-call gate can pause execution for approval and resume cleanly.
- Errors reach transports as structured `{ code, category, retryable, message }`, not strings.
- The harness can be exercised end-to-end with no `MessageStore` in scope.
- Behavior parity: existing web-app runs produce identical user-visible output and message rows.

## Out of scope

- Replacing Inngest with another orchestrator.
- Changing the planner or executor prompt strategy.
- Reordering or restructuring the model ladder itself (escalation heuristic stays as-is).
- Building the CLI Ink app (`cli-ink-app/`) or Slack adapter — those consume this refactor; this plan does not deliver them.
- Telemetry schema changes (owned by `agent-telemetry-refactor/`).
- Local-workspace sandbox hardening (owned by `cli-local-sandbox.md`).

## Dependencies & conflicts

- **Blocks `cli-ink-app/`** — that plan's chunks 3, 4, 5, and 7 compose primitives this plan introduces (`Workspace`, narrowed deps, `createAgentSession`, `AbortSignal`, `tool.call.*` events). Ink should not start until at least Phase B is shipped.
- **Blocks `agent-telemetry-refactor/`** — that plan's `summarizeRun`, `turnKey` keying, single end-of-run write, and reuse of `AgentError` / `EscalationReason` all assume this plan's harness surface.
- **Coordinates with `cli-local-sandbox.md`** — that plan owns the local-workspace adapter; this plan's chunk 9 (stub) only renames the port to `Workspace` and adds `kind` + `acquireSession`. The two plans must agree on the adapter signature when chunk 9 lands.
- **Coordinates with `sandbox-auto-revive.md`** — chunk 9's `Workspace.acquireSession` is the natural seam for revive logic. Coordinate naming if both ship close together.
- **Coordinates with `openrouter-model-route-fallbacks.md`** — that plan emits routing decisions; this plan provides the `executeWithLadder` hooks (chunk 4 stub) and `AgentError` (chunk 2) those decisions flow through.
- `docs/plans/drift/` contains only its README.

## Migration & risk

- **Phase A is safe.** Returning more data and more structured errors is additive; consumers that don't read the new fields are unaffected.
- **Phase B is the riskiest.** Removing `MessageStore` from core deps breaks every adapter wiring. Plan: introduce the new dep shape behind a parallel export, migrate Inngest and CLI in the same PR, then delete the old export.
- **Phase C is additive again.** New optional parameters; default behavior unchanged.
- Behavior-parity tests should run against the existing Inngest path at the end of Phase B and again at the end of Phase C. If a real prod-like fixture run exists, gate the merge on it.
