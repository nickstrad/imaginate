---
id: 01-file-sink-per-run
blocks:
  [
    02-iteration-boundary-logs,
    03-context-mutation-logs,
    04-tool-call-logs,
    05-llm-payload-gating,
    06-silent-catch-and-console-sweep,
  ]
blocked_by: []
status: done
---

# 01 — Per-run file sink

## Goal

Every agent run in dev writes its full debug trail to `logs/<projectId>-<unixMs>.jsonl`, opened at the run entrypoint and closed in `finally`.

## Touches

- schema: none
- service: `src/platform/log/index.ts`, `src/platform/log/file-sink.ts` _(new)_, `src/platform/config/env.ts`, `src/agent/application/run-agent.ts`, `src/agent/ports/logger.ts`, `.gitignore`
- ui: terminal output (unchanged formatting; new file appears under `logs/`)

## Acceptance

- [x] failing test exists at `src/platform/log/file-sink.test.ts` exercising open → write JSONL → close roundtrip
- [x] failing test exists at `src/agent/application/run-agent.test.ts` (or co-located) asserting a run with a stub project id produces a `logs/<projectId>-<ms>.jsonl` and closes the stream on both resolve and throw
- [x] tests pass
- [x] type-check clean
- [x] manual smoke: run an agent locally; confirm a file `logs/<projectId>-<unixMs>.jsonl` exists, contains JSONL entries at `debug` level regardless of terminal `LOG_LEVEL`, and is closed when the run ends

## Notes

- File sink is dev-only (`!isProduction`); factory returns a no-op writer in prod.
- Activation rule: only when the logger has a `runId` binding. No `logs/misc-*.jsonl` fallback.
- Write strategy: `fs.createWriteStream` with `{ flags: "a" }`, JSONL, async.
- `runId` format: `"<projectId>-<Date.now()>"`, generated at the run entrypoint.
- Propagation is via explicit `logger.child({ scope, bindings: { runId } })` — no `AsyncLocalStorage`.
- Add `logs/` to `.gitignore` if not already present.
