# 02 — Structured error taxonomy

**Depends on chunk 1.**

## Goal

Promote provider error classification into a domain concept and surface structured errors on events and in `AgentRunResult.error`. Stop collapsing errors to strings.

## What changes

- Move `classifyProviderError` from the AI-SDK adapter into `src/agent/domain/errors.ts`, returning an `AgentError` with a stable `code`, a pinned `category` enum (`rate_limit`, `auth`, `timeout`, `context_length`, `server_error`, `network`, `tool_failed`, `model_refused`, `cancelled`, `unknown`), `retryable`, `message`, and optional `providerRaw` (not persisted).
- `AgentRunResult.error` becomes `AgentError | undefined`. `lastErrorMessage` stays for back-compat through Phase B and is removed in chunk 5.
- `executor.attempt.failed` and `run.failed` events carry the structured error.
- Inngest stops calling its own classifier (`functions.ts:254`); the CLI starts displaying category.

## Why now

Every later chunk benefits: chunk 6 needs `category: "cancelled"` for the abort path, chunk 8's `AgentSession` returns errors to multi-turn callers, and the telemetry refactor reuses the category enum verbatim.

## Out of scope

- Retry behavior changes (only the `retryable` flag is exposed).
- Persisting `providerRaw`.

## Done when

- `AgentRunResult.error` is `AgentError | undefined`, never a bare string.
- Failure events carry the structured error.
- Tests cover one example per category.
