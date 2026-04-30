# 03 — Richer tool-call events

## Goal

Make tool-call activity legible to transports without forcing them to reparse stringified results. Add structured `tool.call.requested` / `tool.call.completed` events and tighten `executor.step.finished` so it references those events by id rather than carrying pre-stringified payloads nested in the step snapshot. After this chunk, CLI, Inngest UI, and any future Slack/web renderer can show success/failure and arguments per tool call from event data alone, with the same `AgentError` shape on failures that the rest of the harness uses.

## The problem

- `Thought.toolResults?: string[]` (`src/agent/domain/types.ts:40`) is pre-stringified at the AI-SDK boundary in `snapshotFromStep` (`src/agent/application/execute-run.ts:67`). Renderers cannot tell ok from err, cannot pull a structured payload, and have to index by array position to pair a result with its `ThoughtToolCall` (`src/agent/domain/types.ts:31`). The web modal does exactly that today (`src/features/projects/presentation/project/components/thoughts-modal.tsx:60`), and the CLI only logs tool names (`src/interfaces/cli/agent-local.ts:311`).
- `ExecutorStepFinished` (`src/agent/domain/events.ts:38-41`) emits the whole `AgentStepSnapshot` as one blob. There is no per-tool-call event a transport can subscribe to, so live progress UIs cannot render a tool call as it starts and finishes — they must wait for the step boundary and then disambiguate.
- Tool-call failure shape is invisible. Failures inside tool execution become opaque strings inside `toolResults`. There is no `AgentError` carried alongside, so a CLI/Web/Slack renderer has no stable code or category to render an error chip.
- The AI SDK already exposes structured tool-call begin/end through its step result (`step.toolCalls`, `step.toolResults`); we are throwing structure away when we serialize into `string[]`.

## What "after" looks like

```ts
// src/agent/domain/events.ts (additions)
export const AgentRuntimeEventType = {
  ...
  ToolCallRequested: "tool.call.requested",
  ToolCallCompleted: "tool.call.completed",
  ExecutorStepFinished: "executor.step.finished",
  ...
} as const;

type ToolCallRequested = {
  type: "tool.call.requested";
  callId: string;          // stable id paired with completed event
  stepIndex: number;
  toolName: string;
  args: Record<string, unknown>;
};

type ToolCallCompleted =
  | {
      type: "tool.call.completed";
      callId: string;
      stepIndex: number;
      toolName: string;
      ok: true;
      result: unknown;     // structured payload from the tool
    }
  | {
      type: "tool.call.completed";
      callId: string;
      stepIndex: number;
      toolName: string;
      ok: false;
      error: AgentError;   // shared taxonomy from chunk 02
    };

type ExecutorStepFinished = {
  type: "executor.step.finished";
  step: AgentStepSnapshot; // see below: drops pre-stringified toolResults
  toolCallIds: string[];   // correlates with ToolCallCompleted events emitted before this
};
```

```ts
// src/agent/domain/types.ts
export interface Thought {
  stepIndex: number;
  text: string;
  toolCalls?: ThoughtToolCall[]; // unchanged: { toolName, args }
  reasoningText?: string;
  finishReason?: string;
  // toolResults?: string[]   // REMOVED — consumers read tool.call.completed
}
```

`snapshotFromStep` (`src/agent/application/execute-run.ts:62`) stops copying `step.toolResults` into `Thought`. The application layer assigns each tool call a stable `callId` (e.g. `${stepIndex}:${toolName}:${idx}` or a nanoid; pick one and document) and emits paired `tool.call.requested` + `tool.call.completed` events around the AI SDK's tool execution, then emits `executor.step.finished` with `toolCallIds: [...]` that references them.

The web modal switches from indexing into `thought.toolResults[tcIdx]` to consuming `tool.call.completed` events; the CLI tool log gains structured rendering of args + ok/err.

## Sequencing

1. Add `ToolCallRequested` / `ToolCallCompleted` to `src/agent/domain/events.ts` and the `AgentRuntimeEventType` map. Use the chunk-02 `AgentError` for the failure variant.
2. Add `toolCallIds: string[]` to `ExecutorStepFinished`. Remove `toolResults` from `Thought` and from `snapshotFromStep`. Update any direct readers in `src/agent/domain/` and `src/agent/application/`.
3. Wire emission in `execute-run.ts` around the AI SDK step loop: build a stable `callId` per tool call, emit `tool.call.requested` before invocation and `tool.call.completed` after, accumulate ids, then attach to `ExecutorStepFinished`.
4. Update consumers that read `toolResults` today:
   - `src/features/projects/presentation/project/components/thoughts-modal.tsx:60-67` — switch the renderer to consume the new completed events through whatever message persistence the web path uses (or carry the structured result on the persisted `Thought` if persistence shape needs to change; record the choice in the PR).
   - `src/interfaces/cli/agent-local.ts:311` — extend the CLI tool log to show args + structured ok/err instead of bare names.
5. Update tests under `src/agent/application/` and `src/agent/testing/` to assert paired emission + `toolCallIds` correlation. Snapshot the event sequence for at least one success and one tool-failure path.

## Definition of done / verification

- `tool.call.requested` and `tool.call.completed` are emitted exactly once each per tool invocation, paired by `callId`, and observable on the event sink in unit tests.
- `executor.step.finished.toolCallIds` lists every `callId` whose completed event preceded that step event in the stream.
- `Thought.toolResults` is gone from `src/agent/domain/types.ts`; `tsc --noEmit` is clean.
- Tool-failure paths surface an `AgentError` on the completed event with a category from chunk 02 (`tool_failed` is the natural fit).
- Web `thoughts-modal` and CLI tool log both render structured tool calls without indexing array positions.
- Behavior parity: no regression in final output, persisted messages, telemetry rows, or executor-step ordering.
- Verification: `npm test` (executor + event-sink tests) plus a manual CLI run that prints structured ok/err for at least one passing and one failing tool call.

## Out of scope

- Persisting the new events to long-term storage. If the web path needs the structured result to survive a reload, either keep a thin server-side projection or open a follow-up; do not bloat persisted `Thought` rows in this chunk beyond what is needed to remove the array-indexed render.
- Changes to `executor.attempt.failed` or `agent.finished`. Those already carry `AgentError` from chunk 02.
- Renaming or restructuring `executor.step.finished` beyond dropping the stringified field and adding `toolCallIds`.
- Cancellation semantics on tool calls (chunk 06 `AbortSignal` work).
- Tool-call gate / approval (chunk 06 `toolCallGate`).

## Dependencies & conflicts

- **Depends on** chunk 02 (shipped) for `AgentError` — `tool.call.completed` failures reuse that shape.
- **Blocks** chunk 04 (`extract-execute-with-ladder`) only loosely: ladder extraction prefers a settled event surface, but chunk 04 can ship without this if needed.
- **Blocks** `cli-ink-app/` chunks 02, 06 — the CLI reducer and tool/verify panels are designed to render `tool.call.*` events directly.
- **Coordinates with** `agent-telemetry-refactor/` — that plan does not currently key off `tool.call.*` events, but if the analysis chunk wants per-tool-call counts later, it will read these events.
- **No conflict with** `cli-local-sandbox.md` or `planner-complexity-routing.md`.
- `docs/plans/drift/` contains only its README.
