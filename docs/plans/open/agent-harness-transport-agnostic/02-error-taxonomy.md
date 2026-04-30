# 02 — Structured error taxonomy

## Goal

Promote the existing provider-error classifier into an agent-domain error contract and surface that contract on runtime events and `AgentRunResult.error`. Stop collapsing terminal runtime errors to bare strings so transports can render category-aware UI, Inngest stops re-classifying message text, and later chunks (tool-call events, cancellation, sessions, telemetry) have one serializable error shape to depend on.

## The problem

- `src/shared/errors/provider.ts` owns the classifier even though every current caller is agent-related (`src/agent/adapters/ai-sdk/model-gateway.ts:170`, `src/interfaces/inngest/functions.ts:37`). Moving the contract into `src/agent/domain/` matches "Folder conventions" without forcing `shared` to import back upward.
- `src/agent/application/run-agent.ts:151` reduces terminal executor failures to `lastErrorMessage: string | null`. `AgentRunResult` has no structured error field (`src/agent/domain/types.ts:86`).
- `src/agent/domain/events.ts:42` emits `executor.attempt.failed` as `{ category, retryable }` only, and `agent.finished` only carries `lastErrorMessage`. Event consumers cannot see a stable code or display message.
- The temporary Inngest ladder fork classifies an executor failure once (`src/interfaces/inngest/functions.ts:255`) and then re-classifies `lastErrorMessage` later (`src/interfaces/inngest/functions.ts:311`) to save the provider-error assistant message. `askAgentFunction` also classifies direct model errors at `src/interfaces/inngest/functions.ts:454`.
- The existing provider categories are `credit`, `rate_limit`, `auth`, `timeout`, `connection`, and `unknown` (`src/shared/errors/types.ts`). This chunk must preserve those names for behavior parity; do not rename `connection` to `network` or drop `credit`.

## What "after" looks like

```ts
// src/agent/domain/errors.ts (new)
export type AgentErrorCategory =
  | "credit"
  | "rate_limit"
  | "auth"
  | "timeout"
  | "connection"
  | "tool_failed"
  | "model_refused"
  | "cancelled"
  | "unknown";

export interface AgentError {
  code: string; // stable identifier, e.g. "provider.rate_limit"
  category: AgentErrorCategory;
  retryable: boolean;
  message: string; // current user-safe provider message, not an Error object
}

export function classifyAgentError(err: unknown): AgentError;
```

```ts
// src/agent/domain/types.ts
export interface AgentRunResult {
  ...
  error?: AgentError;
  /** @deprecated removed in chunk 05 */
  lastErrorMessage: string | null;
}
```

```ts
// src/agent/domain/events.ts
type ExecutorAttemptFailed = {
  type: "executor.attempt.failed";
  attempt: number;
  error: AgentError;
  category: AgentErrorCategory; // compatibility alias for this chunk
  retryable: boolean;           // compatibility alias for this chunk
};

type AgentFinished = {
  type: "agent.finished";
  ...
  error?: AgentError;
  lastErrorMessage: string | null;
};
```

`ModelGateway.classifyError` returns `AgentError`, not a partial `{ category, retryable }`. The AI-SDK adapter imports `classifyAgentError` from `@/agent/domain/errors`; the application layer treats the returned `AgentError` as the single source of truth. Because `shared` cannot import `agent`, do **not** leave `src/shared/errors/provider.ts` as a re-export from the new domain module. After the two current imports move, delete the old shared error files or leave them only if a real non-agent caller still exists.

Terminal error semantics stay narrow: set `AgentRunResult.error` and `agent.finished.error` when an executor/provider/runtime exception produced `lastErrorMessage`. A model-produced `finalOutput.status === "failed"` is a valid agent result, not a synthesized `AgentError`. A planner exception that falls back to `DEFAULT_PLAN` remains a warning event unless the overall run later fails.

## Sequencing

1. Add `src/agent/domain/errors.ts` with `AgentError`, `AgentErrorCategory`, and `classifyAgentError`. Move the provider rule table and tests from `src/shared/errors/*`, preserving existing category strings and user-facing messages. Delete the shared module if no imports remain.
2. Change `ProviderErrorClassification` / `ModelGateway.classifyError` to return `AgentError`. Update the AI-SDK adapter and in-memory fake classifier.
3. Wire the returned `AgentError` through `run-agent.ts`: `ExecutorAttemptFailed.error`, `AgentFinished.error`, and `AgentRunResult.error` all use the same object; `lastErrorMessage` remains populated for compatibility.
4. Mirror that wiring in the temporary Inngest ladder fork until chunk 04 deletes it. The `save-provider-error` path should read `executeOutcome.error.message` / `.category`, not re-classify `lastErrorMessage`.
5. Update `askAgentFunction` to import `classifyAgentError` from `@/agent/domain/errors` for its direct `generateText` catch path.
6. CLI and event sinks: print/log `error.category` and `error.message`, keep JSON output backward-compatible by retaining `lastErrorMessage` and adding `error`.

## Definition of done

- `AgentRunResult.error` is `AgentError | undefined` on every terminal runtime/provider failure return; `lastErrorMessage` is still populated and marked deprecated.
- `executor.attempt.failed` and terminal `agent.finished` events carry the same `AgentError` object used by the result.
- `src/interfaces/inngest/functions.ts` no longer imports `classifyProviderError`.
- The old `src/shared/errors/*` module is gone unless a non-agent caller still exists; if it stays, it must not import from `src/agent`.
- Unit tests cover the preserved provider categories (`credit`, `rate_limit`, `auth`, `timeout`, `connection`, `unknown`) plus harness-owned categories that are implemented in this chunk. `runAgent` tests assert propagation to `ExecutorAttemptFailed.error`, `AgentFinished.error`, and `AgentRunResult.error`.
- Behavior parity: existing Inngest runs surface the same category they did via the duplicated classifier.
- Verification: run the focused agent/error tests first, then `npx tsc --noEmit` because this changes exported event/result types.

## Out of scope

- Renaming existing provider categories or changing retry decisions.
- Retry behavior changes (only the `retryable` flag is exposed; nothing acts on it yet).
- Persisting raw provider error objects to telemetry or events.
- Removing `lastErrorMessage` (deferred to chunk 05 along with the wider deps narrowing).
- Cancellation wiring (chunk 06 produces the `AbortSignal` plumbing that makes `category: "cancelled"` reachable end-to-end).
- Extracting the duplicated Inngest ladder (chunk 04).

## Dependencies & conflicts

- **Depends on** chunk 01 (shipped) for `AgentRunResult` carrying structured run data; this chunk extends the same return shape with `error`.
- **Blocks** `03-richer-events.md` because `tool.call.completed` failures use `AgentError`.
- **Blocks** chunks 06 (cancellation needs `category: "cancelled"`), 08 (`AgentSession` returns `AgentError` to multi-turn callers), and `agent-telemetry-refactor/` (reuses `AgentErrorCategory` verbatim).
- **Coordinates with** `cli-ink-app/` because its reducer and tool/error panels render `AgentError` from runtime events.
- **No conflict with** `cli-local-sandbox.md` or `sandbox-auto-revive.md`.
- `docs/plans/drift/` contains only its README. `openrouter-model-route-fallbacks.md` is archived, so it is historical context, not an active dependency for this chunk.
