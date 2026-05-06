---
id: 07-interfaces-run-start-log
blocks: []
blocked_by: []
status: done
---

# 07 — `info` "run start" log at interface entrypoints

## Goal

Every `src/interfaces/**` entrypoint that initiates an agent run emits a single `info` "run start" log at the boundary, so the trail is preserved if the run fails before the agent loop starts.

## Touches

- schema: none
- service: `src/interfaces/inngest/functions.ts`, plus any other entrypoint under `src/interfaces/**` that calls into the agent
- ui: terminal shows one `info` line per run start at the boundary

## Acceptance

- [x] failing test exists at the relevant interface module asserting one `info` "run start" entry is emitted before the agent run is invoked, with at least `{ projectId }` (and any other contextual ids available pre-run)
- [x] test passes
- [x] type-check clean
- [x] manual smoke: CLI helper is covered by test; Inngest code-agent boundary log now fires before opening the run file sink

## Notes

- This log fires _before_ the per-run file sink exists (the `runId` is generated inside `run-agent`), so the entry only reaches the terminal — that is intentional.
- Independent of slice 01: the boundary log is useful even without the file sink.
- Keep it to one line per entrypoint; this is a boundary marker, not a place to dump request payloads.
