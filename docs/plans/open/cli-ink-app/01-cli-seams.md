# 01 — CLI seams

**Prereq:** `agent-harness-transport-agnostic/` shipped. The harness deps shape is `{ modelGateway, workspace, toolFactory, eventSink, logger }` with optional `persistence?: { telemetryStore, turnKey }`. There is no `MessageStore` port to wire.

## Goal

Split `src/interfaces/cli/agent-local.ts` into focused modules and compose the **post-refactor** harness deps. Behavior preserved (still defaults to E2B in this chunk; cwd swap is chunk 3) so the surface is small and testable.

## The problem

`agent-local.ts` mixes argument parsing, sandbox provisioning, dependency composition, event sink wiring, output formatting, and process exit. There is no place to plug in an Ink app, a reducer, or a SQLite-backed `TelemetryStore` without touching the same monolith.

## What "after" looks like

```txt
src/interfaces/cli/
  agent-local.ts                # entrypoint: parse → route → exit
  args.ts                       # cac parsing, mode resolution, types
  runtime/
    compose-deps.ts             # AgentRuntimeDeps + Workspace from args
    types.ts
  output/
    jsonl.ts                    # JSONL writer + event mapping (uses tool.call.* and AgentError)
    text.ts                     # one-shot human output
```

`compose-deps.ts` returns the new harness shape:

```ts
export function composeDeps(args: ParsedArgs): {
  deps: AgentRuntimeDeps; // no messageStore
  workspace: Workspace; // E2B in this chunk; chunk 3 switches to local
  config: AgentRuntimeConfig;
};
```

## Sequencing within the chunk

1. Extract `args.ts` (pure cac wrapper returning a discriminated union).
2. Extract `output/jsonl.ts` and `output/text.ts`. JSONL emits the structured `AgentError` and `tool.call.*` events directly.
3. Extract `runtime/compose-deps.ts` against the post-refactor `AgentRuntimeDeps`.
4. Reduce `agent-local.ts` to routing + lifecycle.

## Definition of done

- Behavior identical: same flags, same JSONL shape (now richer because of structured events), same one-shot output, same exit codes.
- Each helper has unit tests with fakes; no E2B or model calls in tests.
- No new exports from `src/agent`.
- No code references `MessageStore`; it doesn't exist post-refactor.
- `npm test`, lint, typecheck pass.

## Out of scope

- Reducer, Ink, SQLite, cwd workspace.
