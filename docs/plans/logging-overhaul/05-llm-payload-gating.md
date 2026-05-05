---
id: 05-llm-payload-gating
blocks: []
blocked_by: [01-file-sink-per-run, 02-iteration-boundary-logs]
status: ready
---

# 05 — LLM payload gating

## Goal

LLM calls always emit a `debug` summary `{ messageCount, totalChars, model, finishReason, usage }`; setting `LOG_LLM_PAYLOADS=true` adds full prompt/response payloads to that entry's metadata so the per-run file captures the complete exchange.

## Touches

- schema: none
- service: `src/platform/config/env.ts` (add `LOG_LLM_PAYLOADS` boolean, default `false`), `src/agent/adapters/ai-sdk/**` (LLM call sites), `src/agent/application/plan-run.ts`, `src/agent/application/execute-run.ts` (where LLM is invoked)
- ui: none

## Acceptance

- [ ] failing test exists covering: with `LOG_LLM_PAYLOADS=false`, debug entry has summary fields and no `prompt`/`response` keys; with `LOG_LLM_PAYLOADS=true`, the same entry includes full `prompt` and `response` in metadata
- [ ] test passes
- [ ] type-check clean
- [ ] manual smoke: run with `LOG_LLM_PAYLOADS=true` set, confirm `logs/<run>.jsonl` contains full prompt/response on the LLM debug entries; rerun unset and confirm payloads are absent

## Notes

- Default `LOG_LLM_PAYLOADS=false` to keep file size sane for normal runs.
- Terminal output stays summary-only at `debug` regardless of the env var; the variable only controls whether the metadata carries the full payload (which then flows into the file sink).
- Existing key-based redaction still applies to payload contents.
