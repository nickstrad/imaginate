---
id: 04-tool-call-logs
blocks: []
blocked_by: [01-file-sink-per-run, 02-iteration-boundary-logs]
status: ready
---

# 04 — Structured tool-call logs (and remove global string truncation)

## Goal

Every tool call emits a `debug` entry with full args verbatim and a result truncated at ~2KB carrying `length` and `truncated: true` flags, so the per-run file is sufficient to reproduce the call. The global `MAX_STRING_CHARS` truncation in `normalizeValue` is removed in the same change so truncation lives only at this call site.

## Touches

- schema: none
- service: `src/agent/application/execute-run.ts` (tool-call wrapper), any tool-call sites under `src/agent/adapters/**` that bypass the wrapper, `src/platform/log/normalize.ts` (drop `MAX_STRING_CHARS`)
- ui: none

## Acceptance

- [ ] failing test exists at `src/platform/log/normalize.test.ts` asserting: a 100KB string passes through verbatim; redaction keys still emit `REDACTED`; `Error` instances still serialize to `{ name, message, stack }`
- [ ] failing test exists at `src/agent/application/execute-run.test.ts` (or co-located) covering: a small result (no truncation, `truncated: false`, `length === actual`); a >2KB result (truncated to ~2KB, `truncated: true`, `length === original size`); args are present verbatim
- [ ] tests pass
- [ ] type-check clean
- [ ] manual: `rg -n 'MAX_STRING_CHARS' src/platform/log` returns zero results
- [ ] manual smoke: run an agent that invokes a tool with a large output (e.g. read of a big file or a search); `logs/<run>.jsonl` shows the args in full and the result trimmed to ~2KB with both flags

## Notes

- Removing `MAX_STRING_CHARS` and adding the call-site cap are paired: do them together so no log is ever silently truncated by `normalizeValue` while a tool result lacks an explicit cap.
- `length` is the original (pre-truncation) byte/char length; `truncated` is always present (`true | false`).
- Full args at `debug`, never elided. Sensitive values are still subject to existing key-based redaction. `Error` serialization in `normalizeValue` stays intact.
