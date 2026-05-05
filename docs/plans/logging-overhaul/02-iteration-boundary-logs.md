---
id: 02-iteration-boundary-logs
blocks: []
blocked_by: [01-file-sink-per-run]
status: ready
---

# 02 — Per-iteration boundary logs

## Goal

A developer watching the terminal at `info` sees exactly one line per loop iteration with `{ iteration, stepKind, toolName?, ms }`.

## Touches

- schema: none
- service: `src/agent/application/execute-run.ts`, `src/agent/application/run-agent-deps.ts` (verify logger propagation), `src/agent/testing/test-logger.ts` _(new — introduced here)_, `src/agent/testing/index.ts`
- ui: terminal output (one `info` line per iteration)

## Acceptance

- [ ] failing test exists at `src/agent/testing/test-logger.test.ts` covering: noop default does nothing observable; `record: true` captures every level + bindings + scope + metadata; child loggers inherit bindings into recorded entries
- [ ] failing test exists at `src/agent/application/execute-run.test.ts` (using `createTestLogger({ record: true })`) asserting one boundary entry per iteration with `{ iteration, stepKind, toolName?, ms }` bindings/metadata
- [ ] tests pass
- [ ] type-check clean
- [ ] manual smoke: run an agent that performs ≥2 iterations; terminal at `info` shows one boundary line per iteration with monotonically increasing `iteration`, and `ms` is populated

## Notes

- This slice introduces `createTestLogger()` as part of its test substrate (noop default; `record: true` captures entries). Subsequent slices reuse it.
- Introduce iteration counter inside the loop in `execute-run.ts`.
- Per-iteration child logger: `runLogger.child({ scope: "iter", bindings: { iteration } })`. Every log inside that iteration body must use this child so `iteration` is automatically attributed.
- `ms` measured via the existing `timed()` helper.
- Boundary log is `info`. Anything richer (full args, payloads) is `debug` and lands in the per-run file from slice 01.
