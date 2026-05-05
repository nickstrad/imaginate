# Logging Overhaul — PRD

## Problem statement

Today, agent runs are hard to observe locally. Errors get swallowed in `catch` blocks that log nothing or return defaults; the planning/execution loop emits no per-iteration boundary so a developer watching the terminal sees activity but cannot tell which iteration is running, which tool was invoked, or how long anything took; and the agent's message/context array is mutated in several places without any record of when or why it shrinks, producing the "context randomly drops" symptom. The existing `src/platform/log` Logger is sound — leveled, scoped, structured, with a `timed()` helper — but coverage is thin and there is no way to recover the full forensic trail of a past run after the fact. This blocks debugging of any non-trivial agent behavior.

## Proposed solution

An instrumentation-first overhaul of `src/agent/**` on top of the existing `platform/log` Logger. We add (a) a per-run file sink that writes the full debug trail of every agent run to `logs/<projectId>-<unixMs>.jsonl` in dev, (b) a sweep that replaces silent `catch` blocks and ad-hoc `console.*` calls with structured logger calls and rethrows, (c) per-iteration boundary logs in the run loop, (d) explicit logs at every context-mutation site, and (e) a tool-call log shape that records full args and a length-capped result. No new infra beyond the file sink; no production behavior change beyond errors that previously failed silently now surfacing.

## User stories

- As a developer running an agent locally, I want one `info` line per loop iteration with `{ iteration, stepKind, toolName?, ms }`, so that I can watch a run live and know what step it's on without flipping to `debug`.
- As a developer debugging a failed run, I want the complete debug-level trail of that run saved to a single file named after the project and run timestamp, so that I can `cat logs/<projectId>-<ts>.jsonl | jq` and reconstruct what happened without re-running.
- As a developer investigating "context randomly dropped", I want every append/trim/summarize/replace of the context array to emit an `info` log with `before`, `after`, and `reason` fields, so that I can grep one file and find the exact mutation site and condition.
- As a developer hitting a previously-silent failure, I want errors caught inside `src/agent/**` to be logged at `error` and rethrown by default, so that failures stop being invisible — and any intentional log-and-continue site is annotated with a one-line comment explaining why swallowing is correct.
- As a developer inspecting a tool call, I want full args logged at `debug` and the result truncated at ~2KB with `length` and `truncated: true` flags, so that I can reproduce the call without drowning the log in large file reads or search results.
- As a developer needing the full LLM payload, I want `LOG_LLM_PAYLOADS=true` to include the complete prompt and response in the per-run file (still summary-only at `debug` in the terminal), so that I can opt into payload inspection without making the terminal unreadable.
- As a developer running tests, I want a shared `createTestLogger()` helper (noop default, optional recorder) so that I can pass a logger to any code path under test and optionally assert on emitted entries.

## Modules to modify

- `src/platform/log/index.ts` — add a file-sink hook so an entry can be mirrored to a write stream when the logger has a `runId` binding. Existing pretty/compact terminal formatting unchanged.
- `src/platform/log/normalize.ts` — remove the global `MAX_STRING_CHARS` per-string truncation. Keep `REDACTED` key-based redaction. Keep `Error` → `{ name, message, stack }` serialization.
- `src/platform/log/file-sink.ts` _(new)_ — owns per-run write streams: `openRunFileSink({ runId }) → { write(entry), close() }`. Async write stream (`fs.createWriteStream` with `{ flags: "a" }`) writing JSONL. Dev-only (`!isProduction`); no-op factory in prod.
- `src/agent/ports/logger.ts` — extend `AgentLogger` contract to document the `runId` binding and per-run file activation rule. No method signature changes.
- `src/agent/application/run-agent.ts` — at the run entrypoint: derive `runId = "<projectId>-<Date.now()>"`, open the per-run file sink, build a child logger bound with `{ runId }`, wrap the run body in `try/finally` that closes the sink. Replace existing `catch (err)` sites with `logger.error` + rethrow.
- `src/agent/application/execute-run.ts` — introduce iteration counter; create per-iteration child logger `runLogger.child({ scope: "iter", bindings: { iteration } })`; emit `info` boundary logs with `{ iteration, stepKind, toolName?, ms }`; convert silent `catch` sites; wrap tool calls and LLM calls with structured logging (full args at `debug`, results capped ~2KB with `length` + `truncated`).
- `src/agent/application/plan-run.ts` — same treatment: structured logs around plan-step LLM calls; convert the `catch` at line 78 to log-and-rethrow.
- `src/agent/application/run-agent-deps.ts` — confirm logger is in the deps shape and propagated to `execute-run`/`plan-run`.
- `src/agent/adapters/ai-sdk/**` — add `debug` summary logs around LLM calls (`{ messageCount, totalChars, model, finishReason, usage }`); when `LOG_LLM_PAYLOADS=true`, include full prompt/response payload in metadata so the file sink captures it.
- `src/agent/adapters/terminal/event-sink.ts` — replace `console.log` fallback (line 42) with structured logger usage where appropriate; preserve user-facing terminal output as a separate concern from logging.
- `src/agent/adapters/e2b/**`, `src/agent/adapters/local-workspace/**`, `src/agent/adapters/memory/**`, `src/agent/adapters/prisma/**` — sweep for `console.*` and silent `catch` blocks; migrate to structured logger with appropriate scope; rethrow on caught errors unless explicitly annotated.
- `src/agent/application/` _(context mutation sites)_ — every site that appends/trims/summarizes/replaces the agent's message/context array gets an `info` log via a child logger scoped `agent:context` with `{ op, before, after, reason }`.
- `src/agent/testing/test-logger.ts` _(new)_ — `createTestLogger({ record? }): AgentLogger & { entries?: LogEntry[] }`. Noop by default; when `record: true`, captures emitted entries for assertions.
- `src/agent/testing/index.ts` — re-export `createTestLogger`.
- `src/agent/testing/run-agent.test.ts`, `src/agent/testing/fakes.test.ts` — update to pass `createTestLogger()` where a logger is needed; add targeted tests for the new behaviors (rethrow-on-catch, context-mutation log emission, per-iteration boundary).
- `src/interfaces/inngest/functions.ts` (and any other run entrypoints under `src/interfaces/**`) — emit a single `info` "run start" log at the boundary so the trail is not lost if the run fails before the agent loop begins.
- `src/platform/config/env.ts` — add `LOG_LLM_PAYLOADS` boolean env var (default `false`). Existing `LOG_LEVEL` and `LOG_PRETTY` unchanged.
- `.gitignore` — add `logs/` if not already present.

## Implementation decisions

Decisions confirmed during the grill, quoted as resolved:

- **Approach is instrumentation-first.** Keep the existing `platform/log` Logger and `timed()` helper. The only new infra piece is the per-run file sink. No remote sinks, no log persistence beyond the local file.
- **Swallowed errors policy: rethrow after `logger.error` by default.** Any `log-and-continue` site requires a one-line comment stating why swallowing is correct (e.g., "best-effort cache write — caller has fallback"). Unannotated swallows are bugs to fix in the sweep.
- **Per-iteration `info` shape: `{ iteration, stepKind, toolName?, ms }`.** Full args, full results (subject to result cap), prompts, and responses go to `debug`. The terminal at `info` stays readable; the file at `debug` keeps everything.
- **Tool calls at `debug`: full args verbatim, results truncated at ~2KB** with `length` and `truncated: true` flags always present. Truncation is per-call-site discipline, not global metadata normalization.
- **Context mutations are logged.** A dedicated `agent:context` scope emits `info` on every append/trim/summarize/replace with `{ op: "append" | "trim" | "summarize" | "replace", before: N, after: M, reason: string }`. Any context shrink without a `reason` is treated as a bug.
- **Sensitive data: keep existing key-based redaction (`apikey`, `token`, `secret`, `bearer`, etc.).** No new value-pattern redaction. `debug` is opt-in via env var and developer-only; users are responsible for not pasting debug logs into tickets.
- **LLM payloads are gated.** Default `debug` carries `{ messageCount, totalChars, model, finishReason, usage }`. Setting `LOG_LLM_PAYLOADS=true` includes full prompt/response in the metadata of those debug entries — which then flow into the per-run file.
- **Per-run file sink scope: full trail.** The file mirrors _every_ log emitted under the run's logger tree, not only LLM payloads. This is the forensic surface for debugging.
- **File sink granularity: always `debug`-level, regardless of terminal `LOG_LEVEL`.** Terminal threshold filters terminal output; the file always receives every entry. Investigations after the fact don't require having cranked the level up in advance.
- **File sink activation: only when a `runId` binding is present on the logger.** Code outside an agent run logs to terminal only. No fallback file like `logs/misc-<date>.jsonl`.
- **`runId` propagation: explicit child logger via `logger.child({ scope, bindings: { runId } })`.** No `AsyncLocalStorage`. Loggers are passed down via the existing ports/DI shape.
- **`runId` source: `"<projectId>-<Date.now()>"`** — millisecond precision to eliminate same-project collisions. Generated at the run entrypoint.
- **File path: `logs/<projectId>-<unixMs>.jsonl`** at the repo root. Gitignored. No automatic rotation or cleanup.
- **Write strategy: async `fs.createWriteStream` with `{ flags: "a" }`**, opened once per run, writing JSONL.
- **Stream lifecycle: `try/finally` at the run entrypoint.** The run body is wrapped; the stream is closed on resolve and on throw. No `process.on("exit")` fallback in this overhaul.
- **Production gating: dev-only.** Gated by `!isProduction` from `src/platform/config/env`. Prod runs on serverless infra where local FS writes are pointless or forbidden.
- **Sweep scope: `src/agent/**`only.** Plus a single`info`"run start" log at each`src/interfaces/**`entrypoint that initiates a run, to preserve the trail across the boundary.`src/features/**` is untouched.
- **Migrate `console.*`** calls inside `src/agent/**` to structured logger calls. Otherwise those lines miss the `runId` binding, never reach the per-run file, and ignore `LOG_LEVEL`.
- **Iteration counter introduced in the run loop** (in `src/agent/application/execute-run.ts`). A per-iteration child logger carries `{ iteration }` as a binding so every log inside that iteration is automatically attributed.
- **Normalization change: remove `MAX_STRING_CHARS` per-string truncation in `normalizeValue`.** Truncation lives only at explicit call sites (tool results). Keep `REDACTED` key-based logic. Keep `Error` serialization.
- **Tests: shared `createTestLogger()` in `src/agent/testing/`.** Noop default; optional `record: true` mode captures entries for assertions.

## Out of scope

- Production log sinks (remote aggregator, file persistence on serverless, JSON-to-stdout for log-shipping). Prod observability is a separate effort.
- Per-run file sink for non-agent code paths (route handlers, app startup, Inngest pre-run logic). Those continue to log to terminal only.
- `AsyncLocalStorage`-based logger propagation. Explicit child loggers only.
- Value-pattern secret redaction (regex matches against `sk-…`, `AKIA…`, `Bearer …` tokens in values). Existing key-based redaction is the only redaction.
- HTTP / tool-call timeouts and `AbortController` plumbing. `timed()` measures elapsed time only; cancel-on-hang is a separate design.
- Rotation, retention, or cleanup policy for `logs/`. Manual `rm logs/*` is the intended workflow.
- Sweep of `src/features/**`, `src/ui/**`, or `src/app/**`.
- Changes to the existing terminal pretty/compact formatting.
- Schema-level enforcement of mandatory bindings (e.g., requiring `runId` at the type level). The convention is enforced by code review and tests, not the type system.

## Open questions

None.
