# 02 — Structured error taxonomy

## Goal

Promote provider error classification into a domain concept and surface structured errors on events and in `AgentRunResult.error`. Stop collapsing errors to bare strings so transports can render category-aware UI, Inngest stops re-classifying, and later chunks (cancellation, sessions, telemetry) have a single error shape to depend on.

## The problem

- `src/agent/adapters/ai-sdk/model-gateway.ts:170` calls `classifyProviderError` from `src/shared/errors/provider.ts` but only uses the result internally — the structured category never escapes the adapter.
- `src/agent/application/run-agent.ts:151` reduces failures to `lastErrorMessage: string | null`. `AgentRunResult` has no structured error field (`src/agent/domain/types.ts:90`).
- Because the category is lost across the harness boundary, `src/interfaces/inngest/functions.ts:311` and `:454` re-run `classifyProviderError` against the message string to recover it. Two classifications, one truth.
- Failure events (`executor.attempt.failed`, `run.failed`) only carry stringly-typed messages, so renderers can't differentiate `rate_limit` from `auth` from `tool_failed`.

## What "after" looks like

```ts
// src/agent/domain/errors.ts (new)
export type AgentErrorCategory =
  | "rate_limit"
  | "auth"
  | "timeout"
  | "context_length"
  | "server_error"
  | "network"
  | "tool_failed"
  | "model_refused"
  | "cancelled"
  | "unknown";

export interface AgentError {
  code: string;                  // stable identifier, e.g. "provider.rate_limit"
  category: AgentErrorCategory;
  retryable: boolean;
  message: string;
  providerRaw?: unknown;         // never persisted
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

The AI-SDK adapter and Inngest both import `classifyAgentError` from `@/agent/domain/errors`. `src/shared/errors/provider.ts` becomes a thin re-export (or is deleted if no non-agent caller remains). Failure events in `src/agent/domain/events.ts` carry `error: AgentError`. CLI prints `error.category` alongside the message.

## Sequencing

1. Add `src/agent/domain/errors.ts` with `AgentError`, `AgentErrorCategory`, and `classifyAgentError`. Move the body of `src/shared/errors/provider.ts` here; keep a re-export at the old path for one PR if any non-agent code imports it.
2. Wire `classifyAgentError` through `run-agent.ts` so `AgentRunResult.error` is populated on every failure path (including cancellation later — for now `cancelled` is reachable via `AbortError` instances).
3. Add `error: AgentError` to `executor.attempt.failed` and `run.failed` event payloads in `src/agent/domain/events.ts`; update event sinks/tests.
4. Inngest: drop the two `classifyProviderError` calls in `functions.ts` and read `result.error` directly.
5. CLI: surface `error.category` in the failure summary path of `src/interfaces/cli/agent-local.ts`.

## Definition of done

- `AgentRunResult.error` is `AgentError | undefined` on every failure return; `lastErrorMessage` still populated but marked deprecated.
- `executor.attempt.failed` and `run.failed` events carry `AgentError`.
- `src/interfaces/inngest/functions.ts` no longer imports `classifyProviderError`.
- One unit test per `AgentErrorCategory` value, plus one test asserting the field is propagated through `runAgent` to `AgentRunResult.error`.
- Behavior parity: existing Inngest runs surface the same category they did via the duplicated classifier.

## Out of scope

- Retry behavior changes (only the `retryable` flag is exposed; nothing acts on it yet).
- Persisting `providerRaw` to telemetry.
- Removing `lastErrorMessage` (deferred to chunk 05 along with the wider deps narrowing).
- Cancellation wiring (chunk 06 produces the `AbortSignal` plumbing that makes `category: "cancelled"` reachable end-to-end).

## Dependencies & conflicts

- **Depends on** chunk 01 (shipped) for `AgentRunResult` carrying structured run data; this chunk extends the same return shape with `error`.
- **Blocks** chunks 06 (cancellation needs `category: "cancelled"`), 08 (`AgentSession` returns `AgentError` to multi-turn callers), and `agent-telemetry-refactor/` (reuses `AgentErrorCategory` verbatim).
- **Coordinates with** `openrouter-model-route-fallbacks.md` — routing decisions feed into the same `AgentError` shape; field names must agree.
