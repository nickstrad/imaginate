# 03 — Richer tool-call events

## Goal

Make tool-call activity legible to transports without forcing them to reparse stringified results. Add structured `tool.call.requested` / `tool.call.completed` events and tighten `executor.step.finished` so it references those events by id rather than carrying pre-stringified payloads nested in the step snapshot. After this chunk, CLI, Inngest UI, and any future Slack/web renderer can show success/failure and arguments per tool call from event data alone, with the same `AgentError` shape on failures that the rest of the harness uses.

Keep the event surface model-provider neutral. The current AI SDK adapter can source these events from its tool-call lifecycle callbacks, but `src/agent/application` must depend only on `ModelGateway` callbacks and domain event types. That keeps the harness swappable: a future LangChain or other engine experiment should be a new adapter behind the same port and behavior tests, not a rewrite of the runtime loop.

## The problem

- `Thought.toolResults?: string[]` (`src/agent/domain/types.ts:40`) is pre-stringified at the AI-SDK boundary in `snapshotFromStep` (`src/agent/application/execute-run.ts:67`). Renderers cannot tell ok from err, cannot pull a structured payload, and have to index by array position to pair a result with its `ThoughtToolCall` (`src/agent/domain/types.ts:31`). The web modal does exactly that today (`src/features/projects/presentation/project/components/thoughts-modal.tsx:60`), and the CLI only logs tool names (`src/interfaces/cli/agent-local.ts:311`).
- `ExecutorStepFinished` (`src/agent/domain/events.ts:38-41`) emits the whole `AgentStepSnapshot` as one blob. There is no per-tool-call event a transport can subscribe to, so live progress UIs cannot render a tool call as it starts and finishes — they must wait for the step boundary and then disambiguate.
- Tool-call failure shape is invisible. Failures inside tool execution become opaque strings inside `toolResults`. There is no `AgentError` carried alongside, so a CLI/Web/Slack renderer has no stable code or category to render an error chip.
- The model port currently hides tool lifecycle information. The AI SDK adapter has structured tool-call start/finish callbacks plus `toolCallId`, args, output, and error data, but `src/agent/ports/model-gateway.ts` exposes only `step.toolCalls` and stringified `step.toolResults`. Any alternate engine should satisfy the same neutral port contract rather than leak its callback names into application code.
- The web path persists only the `thoughts` JSON projection on `Message` today (`src/features/messages/adapters/prisma-message-repository.ts`). If the modal keeps showing tool results after reload, this chunk needs a thin `callId`-keyed projection derived from `tool.call.completed`; it must not reintroduce array-position matching or `toolResults: string[]`.

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
      durationMs?: number;
      result: unknown;     // structured payload from the tool
    }
  | {
      type: "tool.call.completed";
      callId: string;
      stepIndex: number;
      toolName: string;
      ok: false;
      durationMs?: number;
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
export interface ThoughtToolCall {
  callId: string; // correlates with tool.call.* events
  toolName: string;
  args: Record<string, unknown>;
}

export interface Thought {
  stepIndex: number;
  text: string;
  toolCalls?: ThoughtToolCall[];
  reasoningText?: string;
  finishReason?: string;
  // toolResults?: string[]   // REMOVED — consumers read tool.call.completed
}
```

`snapshotFromStep` (`src/agent/application/execute-run.ts:62`) stops copying `step.toolResults` into `Thought`. `GenerateTextRequest` grows provider-neutral tool lifecycle callbacks (for example `onToolCallStart` / `onToolCallFinish`) whose payloads include `callId`, `stepIndex`, `toolName`, args, and either output or error. The AI SDK adapter maps its own lifecycle callbacks into that shape; application code emits `tool.call.requested` / `tool.call.completed` from the neutral callbacks and then emits `executor.step.finished` with `toolCallIds: [...]`.

Use the provider's call id when available. If an adapter does not provide one, generate a deterministic fallback such as `step:${stepIndex}:tool:${index}` inside the adapter/port translation layer and document that it is stable only within a run.

The web modal switches from indexing into `thought.toolResults[tcIdx]` to looking up a completion by `callId`. Because the current web path has no durable event store, this chunk may keep a narrow `callId`-keyed projection in the persisted `thoughts` JSON so reload behavior does not regress. That projection is derived from runtime events and must remain separate from the runtime event contract. The CLI tool log consumes runtime events directly and gains structured rendering of args + ok/err.

## Sequencing

1. Add `ToolCallRequested` / `ToolCallCompleted` to `src/agent/domain/events.ts` and the `AgentRuntimeEventType` map. Use the chunk-02 `AgentError` for the failure variant.
2. Extend `src/agent/ports/model-gateway.ts` with provider-neutral tool lifecycle callback types. Include `callId`, `stepIndex`, `toolName`, `args`, optional `durationMs`, and a discriminated success/failure payload. Do not import AI SDK or LangChain types into the port.
3. Map the current AI SDK adapter's tool-call lifecycle callbacks into the neutral port callbacks. Keep AI SDK callback names and experimental status contained in `src/agent/adapters/ai-sdk/`.
4. Add `callId` to `ThoughtToolCall`, add `toolCallIds: string[]` to `ExecutorStepFinished`, and remove `toolResults` from `Thought` and from `snapshotFromStep`. Update any direct readers in `src/agent/domain/` and `src/agent/application/`.
5. Wire emission in `execute-run.ts`: emit `tool.call.requested` from the neutral start callback, emit `tool.call.completed` from the neutral finish callback, accumulate ids per step, then attach those ids to `ExecutorStepFinished`.
6. Update consumers that read `toolResults` today:
   - `src/features/projects/presentation/project/components/thoughts-modal.tsx:60-67` — switch the renderer to a `callId` lookup. If reload support requires persistence, keep only a thin JSON projection derived from `tool.call.completed`; do not add a broad event log in this chunk.
   - `src/interfaces/cli/agent-local.ts:311` — extend the CLI tool log to show args + structured ok/err instead of bare names.
7. Update tests under `src/agent/application/`, `src/agent/adapters/ai-sdk/`, and `src/agent/testing/` to assert paired emission + `toolCallIds` correlation. Snapshot the event sequence for at least one success and one tool-failure path.

## Definition of done / verification

- `tool.call.requested` and `tool.call.completed` are emitted exactly once each per tool invocation, paired by `callId`, and observable on the event sink in unit tests.
- `executor.step.finished.toolCallIds` lists every `callId` whose completed event preceded that step event in the stream.
- `Thought.toolResults` is gone from `src/agent/domain/types.ts`; `tsc --noEmit` is clean.
- `src/agent/application` emits tool-call events from neutral `ModelGateway` callbacks only; no application file imports AI SDK lifecycle types or callback names.
- Tool-failure paths surface an `AgentError` on the completed event with a category from chunk 02 (`tool_failed` is the natural fit).
- Web `thoughts-modal` and CLI tool log both render structured tool calls without indexing array positions. If the web projection persists completions, it is keyed by `callId`, not by tool-call array position.
- Behavior parity: no regression in final output, persisted messages, telemetry rows, or executor-step ordering.
- Verification: `npm test` (executor + event-sink tests) plus a manual CLI run that prints structured ok/err for at least one passing and one failing tool call.

## Out of scope

- Persisting the new events to long-term storage. If the web path needs the structured result to survive a reload, either keep a thin server-side projection or open a follow-up; do not bloat persisted `Thought` rows in this chunk beyond what is needed to remove the array-indexed render.
- Switching the harness from AI SDK to LangChain or another engine. This chunk prepares the seam by keeping tool lifecycle callbacks provider-neutral; an engine comparison should be a follow-up adapter spike that passes the same event-sequence tests.
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
