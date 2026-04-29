# 03 — Richer tool-call events

## Goal

Make tool-call activity legible to transports without forcing them to reparse stringified results. Add structured `tool.call.requested` / `tool.call.completed` events and tighten `executor.step.finished` so it references those events by id rather than carrying its own pre-stringified payload.

## What changes and why

Today `ExecutorStepFinished.toolResults` is `string[]` (events serialized at the boundary), so renderers in the CLI, web, and any future Slack adapter cannot reliably show structured success/failure or display the actual arguments a tool was called with. Splitting tool calls into their own paired events lets each transport render them in real time and keeps `executor.step.finished` as a lightweight aggregate that points at them via `toolCallIds`.

## Rough shape

- New events in `src/agent/domain/events.ts`: `tool.call.requested` (id, name, args) and `tool.call.completed` (id, ok/err, structured result, error).
- `executor.step.finished` keeps timing + step metadata, drops `toolResults: string[]`, and gains `toolCallIds: string[]`.
- Renderers (CLI, Inngest UI) subscribe to the paired events instead of parsing strings out of the step event.

## Depends on

- Chunk 02 — uses `AgentError` for the `tool.call.completed` failure shape so tool failures share the harness-wide error taxonomy.
