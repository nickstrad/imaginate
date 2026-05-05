---
id: 06-silent-catch-and-console-sweep
blocks: []
blocked_by: [01-file-sink-per-run, 02-iteration-boundary-logs]
status: ready
---

# 06 — Silent-catch and console.\* sweep across `src/agent/**`

## Goal

Every `catch` in `src/agent/**` either logs at `error` and rethrows, or carries a one-line comment justifying log-and-continue; every `console.*` in `src/agent/**` is replaced with a structured logger call carrying the run's bindings.

## Touches

- schema: none
- service: `src/agent/application/run-agent.ts`, `src/agent/application/execute-run.ts`, `src/agent/application/plan-run.ts` (incl. the `catch` at line 78), `src/agent/adapters/ai-sdk/**`, `src/agent/adapters/terminal/event-sink.ts` (line 42 `console.log`), `src/agent/adapters/e2b/**`, `src/agent/adapters/local-workspace/**`, `src/agent/adapters/memory/**`, `src/agent/adapters/prisma/**`
- ui: previously-silent failures now surface in the terminal at `error`

## Acceptance

- [ ] failing test exists asserting that an error thrown inside the run body is logged at `error` _and_ propagates out of `run-agent` (rethrow-on-catch behavior)
- [ ] failing test exists asserting `plan-run.ts` rethrows after logging when the planning LLM call fails
- [ ] test passes
- [ ] type-check clean
- [ ] manual: `rg -n 'console\.(log|warn|error|info|debug)' src/agent` returns zero results
- [ ] manual: every `catch` block in `src/agent/**` either ends in `throw` _or_ has a one-line comment explaining why swallowing is correct
- [ ] manual smoke: deliberately make a tool call throw; confirm the error appears in terminal at `error` and run propagates the failure

## Notes

- Log-and-continue is allowed only with an annotation like `// best-effort cache write — caller has fallback`.
- User-facing terminal output (e.g. event-sink prints intended for the user) stays separate from logger output; only diagnostic `console.*` is migrated.
- This slice does not introduce new `try/catch`, only fixes existing ones.
