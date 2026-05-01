# 05 — Narrow `AgentRuntimeDeps`

**Depends on chunk 04 (`executeWithLadder` extracted, Inngest using hooks).**

## Goal

Remove transport identity from the harness's required dependency surface. After this chunk, `AgentRuntimeDeps` no longer carries `MessageStore`, `TelemetryStore` is opt-in via `runAgent({ persistence })`, and core ports key on opaque `turnKey` / `conversationKey` instead of `projectId` / `messageId`.

## What changes

- Drop `messageStore` from `AgentRuntimeDeps` (`src/agent/application/run-agent-deps.ts:15`). The port is dead in the loop today; consumers that need message persistence wire it through their own transport layer (Inngest already owns Prisma writes via chunk-04 hooks; CLI will own its own SQLite per `cli-ink-app/`).
- Move telemetry writing out of `AgentRuntimeDeps`. New shape:
  ```ts
  runAgent({
    input,
    deps,             // narrowed: no messageStore, no telemetryStore
    config,
    persistence?: { telemetryStore: TelemetryStore; turnKey: string },
  });
  ```
- Drop `projectId` from `MessageStore` (file is removed) and `messageId` from `TelemetryStore`. Replace with opaque `turnKey: string`. Web adapter resolves `turnKey → messageId` internally.
- Remove deprecated `lastErrorMessage: string | null` from `AgentRunResult`; consumers read `result.error: AgentError` from chunk 02.
- Update CLI and Inngest wiring. CLI stops fabricating `projectId: "local"` / `messageId` to satisfy the harness.

## Why now

Chunk 04 isolated the ladder; this chunk is the first chunk that actually changes the harness's public dependency contract. Doing it before Phase C (cancellation, sessions, workspace rename) keeps the surface that the new capabilities attach to clean.

## Risk and migration

This is the breaking chunk. Strategy:

1. Introduce the narrowed `AgentRuntimeDeps` and new `persistence` option behind parallel exports.
2. Migrate Inngest and CLI in the same PR.
3. Delete the old shape and `MessageStore` port.

## Out of scope

- `AbortSignal` plumbing (chunk 06).
- `toolCallGate` (chunk 06).
- `SandboxGateway` → `Workspace` rename (chunk 09).
- Telemetry schema growth (`agent-telemetry-refactor/`).

## Done when

- `grep -rn MessageStore src/agent` returns no hits.
- `runAgent` can be called with no telemetry persistence and produces an `AgentRunResult` with no FK coupling.
- CLI source contains no synthesized `projectId` / `messageId` strings.
- `tsc --noEmit`, `npm test`, lint pass; behavior parity for one representative web run end-to-end.
