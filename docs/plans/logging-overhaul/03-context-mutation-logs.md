---
id: 03-context-mutation-logs
blocks: []
blocked_by: [01-file-sink-per-run, 02-iteration-boundary-logs]
status: ready
---

# 03 — Context mutation logs

## Goal

Every append/trim/summarize/replace of the agent's message/context array emits one `info` log with `{ op, before, after, reason }` under the `agent:context` scope, so `grep agent:context logs/<run>.jsonl` shows every mutation.

## Touches

- schema: none
- service: every site under `src/agent/application/**` that mutates the agent's context array (append/trim/summarize/replace)
- ui: none (logs only)

## Acceptance

- [ ] failing test exists exercising at least one append, one trim, and one summarize/replace path; uses `createTestLogger({ record: true })` to assert each emits exactly one `agent:context` info entry with `{ op, before: N, after: M, reason: <non-empty string> }`
- [ ] test passes
- [ ] type-check clean
- [ ] manual smoke: run an agent that triggers a context summarize/trim; grep `logs/<run>.jsonl` for `agent:context` and confirm each mutation has a non-empty `reason`

## Notes

- `op` is one of `"append" | "trim" | "summarize" | "replace"`.
- Any context shrink without a `reason` is treated as a bug — fix the caller, do not log a placeholder.
- Use a child logger scoped `agent:context`; carries the parent run's `runId` binding automatically.
