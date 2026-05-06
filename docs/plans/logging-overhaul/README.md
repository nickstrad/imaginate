# Logging Overhaul — Tickets

Source PRD: [`prd.md`](./prd.md)

Each ticket is a vertical slice that produces developer-visible behavior end-to-end in one pass. Slice 01 (file sink) is the foundation; 02 introduces both the iteration boundary log and the shared `createTestLogger` helper that 03–06 reuse. Slice 07 is independent.

| ID                                                                          | Status | Goal                                                                                                             | Blocked by |
| --------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| [01-file-sink-per-run](./01-file-sink-per-run.md)                           | done   | Every dev agent run writes `logs/<projectId>-<unixMs>.jsonl` opened/closed at the run entrypoint.                | —          |
| [02-iteration-boundary-logs](./02-iteration-boundary-logs.md)               | done   | One `info` line per loop iteration with `{ iteration, stepKind, toolName?, ms }`; introduces `createTestLogger`. | 01         |
| [03-context-mutation-logs](./03-context-mutation-logs.md)                   | done   | Every context append/trim/summarize/replace emits `agent:context` info with `{ op, before, after, reason }`.     | 01, 02     |
| [04-tool-call-logs](./04-tool-call-logs.md)                                 | done   | Tool calls log full args + result capped ~2KB with `length`/`truncated`; removes global `MAX_STRING_CHARS`.      | 01, 02     |
| [05-llm-payload-gating](./05-llm-payload-gating.md)                         | done   | LLM debug summary always; `LOG_LLM_PAYLOADS=true` adds full prompt/response to the file.                         | 01, 02     |
| [06-silent-catch-and-console-sweep](./06-silent-catch-and-console-sweep.md) | done   | Sweep `src/agent/**` for silent catches and `console.*`; rethrow-by-default with annotated exceptions.           | 01, 02     |
| [07-interfaces-run-start-log](./07-interfaces-run-start-log.md)             | done   | One `info` "run start" line at each `src/interfaces/**` entrypoint that initiates a run.                         | —          |
