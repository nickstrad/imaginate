# CLI Ink coding agent

## Required reading before planning

Before writing a new full chunk file here, promoting a stub, or reshaping the chunk index, read [`docs/documentation/harness-engineering/harness_engineering_a_design_guide_claude_code.pdf`](../../../documentation/harness-engineering/harness_engineering_a_design_guide_claude_code.pdf). It overlaps directly with this plan's surface area (chat loop, tool log, interrupts, per-folder persistence, approval flows) and should guide how chunks are scoped — full-detail vs. one-line stubs, where seams belong, and which CLI behaviors are worth specifying up front vs. discovering at implementation.

**Implement after `agent-harness-transport-agnostic/`.** This plan assumes the harness refactor has shipped: `createAgentSession`, `Workspace` (replacing `SandboxGateway`), `AgentError`, structured `tool.call.*` events, `AbortSignal` support, optional `toolCallGate`, narrowed `AgentRuntimeDeps` (no `MessageStore`), and `runAgent` returning a frozen `RunState`. Several originally-tricky chunks shrink because they now compose harness primitives instead of reinventing them.

## Goal

Turn `npm run agent:local` into a real terminal coding agent — same product shape as Claude Code, Codex CLI, or opencode — built on the post-refactor harness. The CLI runs inside whatever folder the user invokes it from; that folder IS the workspace. The agent reads, writes, and runs commands directly in `process.cwd()`. Conversations persist in a per-folder SQLite database so the user can pick up where they left off.

## The product, briefly

```txt
$ cd ~/code/my-app
$ npm run agent:local
┌─ imaginate · ~/code/my-app ──────────────────────────────────┐
│  > fix the failing form submit                               │
│  · planning…                                                  │
│  · editing src/components/SignUp.tsx                          │
│  · running: pnpm test signup                                  │
│  ✓ tests pass                                                 │
│                                                               │
│  > _                                                          │
└──────────────────────────────────────────────────────────────┘
```

Key product choices:

- **The folder is the unit.** No project picker, no `--project` flag. The CLI is rooted at `process.cwd()`. Conversation history is per-folder.
- **Local `Workspace`, never E2B.** The CLI uses the `Workspace` port with `kind: "local"`. The harness no longer carries preview-URL semantics in its core port (those moved to `PreviewProvider`); the CLI ignores preview entirely.
- **Coding-agent loop, not chat.** Prompt → plan → edit/run → verify → reply → next prompt. The Ink UI surfaces plan, structured tool calls (`tool.call.requested` / `tool.call.completed`), command output, verification results inline.
- **Durable per-folder history in SQLite.** `<cwd>/.imaginate/agent.sqlite` holds messages, runs, and a `RunTelemetrySummary` row per turn. CLI owns this; `MessageStore` is no longer a harness port.
- **Real cancel.** Ctrl+C aborts the in-flight run via the harness's `AbortSignal` plumbing.

## What "after" looks like

Entrypoints:

```txt
npm run agent:local                       # interactive Ink app rooted at cwd
npm run agent:local -- chat               # explicit interactive
npm run agent:local -- run "fix the form" # one-shot text output
npm run agent:local -- --json "fix it"    # JSONL automation mode
npm run agent:local -- --no-persist       # skip SQLite for this session
npm run agent:local -- --db <path>        # override SQLite location
```

Folder shape:

```txt
src/interfaces/cli/
  agent-local.ts                # entrypoint: parse → route → exit
  args.ts                       # cac parsing and mode resolution
  runtime/
    compose-deps.ts             # AgentRuntimeDeps + Workspace + PreviewProvider (none) for cwd
    persistence/
      sqlite.ts                 # open <cwd>/.imaginate/agent.sqlite
      messages.ts               # CLI-owned message rows (NOT a harness port)
      telemetry-store.ts        # implements harness TelemetryStore against sqlite
    session-reducer.ts          # AgentRuntimeEvent -> CLI app state
    types.ts
  app/
    cli-app.tsx                 # Ink root; uses createAgentSession
    keymap.ts
    theme.ts
    components/
      message-list.tsx
      message-bubble.tsx
      prompt-input.tsx
      run-status.tsx
      thought-log.tsx
      tool-log.tsx
      verification-list.tsx
      diff-summary.tsx
      footer.tsx
  output/
    jsonl.ts
    text.ts
```

Wiring uses the harness `createAgentSession` directly:

```ts
const workspace = createLocalWorkspace({ root: process.cwd() }); // kind: "local"
const session = createAgentSession({
  deps,
  workspace,
  conversationKey: workspace.id,
  config,
});

const abort = new AbortController();
const result = await session.runTurn(prompt, {
  previousMessages: history, // loaded from cli sqlite
  signal: abort.signal,
  persistence: { telemetryStore, turnKey: nanoid() },
  toolCallGate: cliToolCallGate, // optional, for confirmations
});
```

CLI-owned reducer (no harness coupling beyond event/error types):

```ts
type CliAppState = {
  workspaceRoot: string;
  messages: CliMessage[];
  activeRun?: {
    status: "planning" | "executing" | "finished" | "failed" | "cancelled";
    plan?: PlanOutput;
    steps: CliStep[];
    tools: ToolCallRecord[]; // built from tool.call.* events
    verification: VerificationRecord[];
    usage: UsageTotals;
    error?: AgentError; // harness-provided structured error
  };
};
```

Per-folder SQLite schema (CLI-owned; the harness has no `MessageStore`):

```sql
create table message (
  id text primary key,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  status text not null check (status in ('pending', 'complete', 'error')),
  created_at text not null,
  updated_at text not null
);

create table run (
  id text primary key,
  user_message_id text not null references message(id),
  assistant_message_id text references message(id),
  turn_key text not null unique,        -- the opaque key passed to the harness
  status text not null,
  created_at text not null,
  updated_at text not null
);

create table telemetry (
  turn_key text primary key references run(turn_key) on delete cascade,
  -- fields mirror RunTelemetrySummary from agent-telemetry-refactor
  steps integer not null,
  files_read integer not null,
  files_written integer not null,
  commands_run integer not null,
  build_succeeded integer not null,
  total_attempts integer not null,
  escalated_to text,
  escalation_reason text,
  run_status text not null,
  error_code text,
  error_category text,
  duration_ms integer not null,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  created_at text not null
);
```

Identity is the file path (`<cwd>/.imaginate/agent.sqlite`). No `project` table.

## Chunk index

**Per `docs/plans/AGENTS.md`, only the next two chunks have files. Later chunks are one-line stubs and get promoted to full files when they become the next-to-implement.**

1. [`01-cli-seams.md`](01-cli-seams.md) — Split `agent-local.ts` into `args.ts`, `output/`, `runtime/compose-deps.ts`. Compose against the new harness deps shape. Behavior preserved. _(current chunk, full detail)_
2. [`02-reducer-and-events.md`](02-reducer-and-events.md) — CLI-owned reducer over `AgentRuntimeEvent`s (including `tool.call.*`) and `AgentError`. Headless, fully tested. _(N+1, lighter detail)_
3. `03-cwd-workspace` — Compose `Workspace` with `kind: "local"` rooted at `process.cwd()`; drop E2B from the default CLI path. Skip `PreviewProvider`.
4. `04-sqlite-per-folder` ‖ — CLI-owned per-folder SQLite for messages + runs + telemetry; harness `TelemetryStore` keyed on opaque `turnKey`. Can ship in parallel with chunk 3.
5. `05-ink-shell` — Add `ink`, render the first interactive shell using `createAgentSession`. Transcript, prompt input, active run status, footer.
6. `06-tool-and-verify-panels` — Plan output, structured tool log (from `tool.call.*`), verification rows, token usage, diff summary, `AgentError` rendering.
7. `07-interrupts-and-polish` — Three flavors of step-boundary interrupt: Ctrl+C full cancel via `AbortSignal`; Escape pause-and-steer via `PauseController` (the prompt-input stays editable while paused, submit calls `resumeWith({ additionalUserMessage })`, the run continues with the new context); optional `toolCallGate` for `/approve` mode. Plus scroll, slash commands, narrow-terminal layout, plain-text fallback.

Git tool rendering (status/diff/branch/commit panels) lands alongside chunk 06 and is owned by `cli-git-tools.md`; chunk 06 generalizes its tool log so the git plan can mount a diff-aware renderer without forking the panel.

Chunks 1 and 2 must land before Ink. Chunk 3 unblocks running against cwd. Chunk 4 unblocks back-and-forth conversation. Chunk 5 ships the first interactive app. Chunks 6 and 7 are incremental.

## Definition of done / verification

- `src/agent` exports no Ink, React, terminal rendering, keybinding, SQLite, or CLI-specific state.
- `npm run agent:local` in any folder opens an Ink app rooted at that folder, persists messages and a per-turn `RunTelemetrySummary` to `<cwd>/.imaginate/agent.sqlite`, and never calls E2B.
- One-shot `run` and `--json` modes remain available; both default to local `Workspace` and per-folder SQLite (or `--no-persist`).
- Re-running in the same folder loads previous messages into the planner. Different folders → independent histories.
- The Ink app sends prompts, shows messages, surfaces planner output, structured tool calls, command results, verification rows, token usage, and final output as live updates from `AgentRuntimeEvent`s.
- Ctrl+C cancels in-flight runs via the harness `AbortSignal`; cancellation produces an `AgentError` with `category: "cancelled"`.
- Escape pauses the in-flight run at the next step boundary without killing it; the user can type a new message and submit it, which resumes the same run with the new message threaded into the conversation. The pause UI distinguishes "paused, awaiting input" from "running" and from "cancelled."
- Reducer tests cover state transitions using plain runtime events and `AgentError`s.
- Ink component tests cover transcript rendering, prompt submission, active-run status, error state, and narrow-terminal layout via `ink-testing-library`.
- SQLite store tests use temp-file databases.
- No CLI code constructs a fake `projectId` or `messageId` to satisfy harness ports.

## Out of scope

- Sharing React DOM components between web and CLI.
- A "projects" abstraction.
- E2B in the default CLI path.
- Browser preview / `--open` (`cli-local-sandbox.md` owns it).
- Sharing the SQLite schema with the web app's Postgres schema.
- Reasoning-trace persistence beyond compact telemetry.
- Full-screen IDE / interactive diff viewer in the first pass.
- Offline LLM.
- Anything already delivered by `agent-harness-transport-agnostic/` (cancellation plumbing, structured errors, tool-call gate primitive, `AgentSession`, `Workspace`, `tool.call.*` events).

## Dependencies & conflicts

- **Depends on `agent-harness-transport-agnostic/`** — every chunk composes primitives that plan introduces (`Workspace`, narrowed `AgentRuntimeDeps`, `createAgentSession`, `AgentError`, `tool.call.*` events, `AbortSignal`, optional `toolCallGate`). Do not start until at least Phase B of the harness plan ships.
- **Depends on `cli-local-sandbox.md`** — provides the local-workspace adapter that satisfies `Workspace { kind: "local" }`. If it slips, chunk 3 inlines the minimum cwd implementation and the broader sandbox plan continues separately.
- **Supersedes `cli-sqlite-persistence.md`** — that plan has been deleted. Folder path is the identity; there is no `local_project` table or `--project` flag. Chunk 04 owns the per-folder SQLite schema.
- **Coordinates with `agent-telemetry-refactor/`** — chunk 04 here writes a per-folder SQLite `telemetry` table that mirrors the `RunTelemetrySummary` type defined by that plan. Schemas differ (SQLite vs Postgres); the TS type is shared.
- **Coordinates with `cli-git-tools.md`** — that plan adds git as an agent tool surface with its own permission classes; chunk 06 here renders its `tool.call.*` events. The two plans must agree on the tool-log component contract (panel slot + structured payload shape) before chunk 06 ships.
- **No conflict with** `openrouter-model-route-fallbacks.md` or `sandbox-auto-revive.md`.
- `docs/plans/drift/` contains only its README.

## React / Ink dependency

- The repo uses React `^19.0.1`. Before chunk 5, pick an Ink version compatible with React 19 or document the chosen workaround in that chunk's PR.
- Add `ink-testing-library` only when chunk 5 lands.

## References

- Ink: https://github.com/vadimdemedes/ink
- ink-testing-library: https://www.npmjs.com/package/ink-testing-library
- Claude Code, Codex CLI, opencode — product references
