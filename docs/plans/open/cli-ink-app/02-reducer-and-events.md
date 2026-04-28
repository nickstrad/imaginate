# 02 — CLI reducer over harness events

**Depends on chunk 1, and on `agent-harness-transport-agnostic/` having shipped (`createAgentSession`, `tool.call.*` events, `AgentError`, frozen `RunState`).**

## Goal

Add a CLI-owned, deterministic reducer that turns harness events and structured errors into terminal app state. Wire the existing one-shot `run` mode to consume `createAgentSession` directly so the reducer is exercised without Ink.

## What changes

- New `runtime/types.ts` with `CliMessage`, `ToolCallRecord`, `ActiveRun`, `CliAppState`. `ToolCallRecord.error` is `AgentError | undefined`.
- New `runtime/session-reducer.ts` with `cliAppReducer(state, action)`. Actions: `runtime.event`, `user.prompt`, `run.completed` (carries the harness `AgentRunResult` including `runState`), `session.error`.
- The reducer treats `tool.call.requested` / `tool.call.completed` as authoritative for the tool log and uses `executor.step.finished.toolCallIds` to correlate.
- `run` mode constructs `createAgentSession`, subscribes the reducer to `eventSink`, calls `runTurn`, then dispatches `run.completed` with the result.

## Why now

Every later chunk reads from this state. Pinning the action shape early prevents Ink components from each inventing their own mental model.

## Out of scope

- Ink rendering, SQLite, cwd workspace, `toolCallGate` UX.

## Done when

- Reducer covers every relevant `AgentRuntimeEvent` branch with plain objects.
- Headless `run` mode uses `createAgentSession` + reducer; output identical to chunk 1.
- No `ink`, `react`, `node:fs`, or `better-sqlite3` imports under `runtime/`.
