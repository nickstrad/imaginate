---
id: 06-silent-catch-and-console-sweep
blocks: []
blocked_by: [01-file-sink-per-run, 02-iteration-boundary-logs]
status: done
---

# 06 — Silent-catch and console.\* sweep across `src/agent/**`

## Goal

Every `catch` in `src/agent/**` either logs at `error` and rethrows, or carries a one-line comment justifying log-and-continue; every `console.*` in `src/agent/**` is replaced with a structured logger call carrying the run's bindings.

## Touches

- schema: none
- service: `src/agent/application/run-agent.ts`, `src/agent/application/execute-run.ts`, `src/agent/application/plan-run.ts` (incl. the `catch` at line 78), `src/agent/adapters/ai-sdk/**`, `src/agent/adapters/terminal/event-sink.ts` (line 42 `console.log`), `src/agent/adapters/e2b/**`, `src/agent/adapters/local-workspace/**`, `src/agent/adapters/memory/**`, `src/agent/adapters/prisma/**`
- ui: previously-silent failures now surface in the terminal at `error`

## Acceptance

- [x] failing test exists asserting that a planning error thrown inside the run body is logged at `error` and propagates out of `run-agent` (rethrow-on-catch behavior)
- [x] failing test exists asserting `plan-run.ts` rethrows after logging when the planning LLM call fails
- [x] test passes
- [x] type-check clean
- [x] manual: `rg -n 'console\.(log|warn|error|info|debug)' src/agent` returns zero results
- [x] manual: every `catch` block in `src/agent/**` either ends in `throw` _or_ has a one-line comment explaining why swallowing is correct
- [x] manual smoke: tool failures are returned as model-visible data by design; executor/model failures now log at `error`, and planner failures propagate

## Notes

- Log-and-continue is allowed only with an annotation like `// best-effort cache write — caller has fallback`.
- User-facing terminal output (e.g. event-sink prints intended for the user) stays separate from logger output; only diagnostic `console.*` is migrated.
- This slice does not introduce new `try/catch`, only fixes existing ones.
