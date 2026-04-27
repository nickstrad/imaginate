# CLI Ink app

## Goal

Turn `npm run agent:local` from a log-printing command into a full terminal app with messages, input, run status, thoughts/tool events, project selection, and preview controls. The agent harness should remain headless and reusable: `src/agent` continues to expose runtime use cases, ports, and events, while `src/interfaces/cli` owns Ink rendering, keyboard handling, CLI state, persistence composition, and terminal-specific workflows.

## The problem

The current CLI is useful for smoke-testing the agent, but it is not an app:

- `src/interfaces/cli/agent-local.ts` mixes argument parsing, E2B provisioning, dependency composition, event formatting, JSON output, sandbox URL handling, and process exit behavior in one file.
- Runtime events are printed as formatted log lines, so the terminal cannot keep durable message bubbles, an active run panel, tool history, verification rows, or a preview/sidebar layout.
- The CLI cannot support a conversation loop naturally. Each invocation exits after one prompt, and previous-message support depends on the SQLite plan rather than an interactive UI flow.
- The web app and CLI both want the same conceptual product experience: messages, assistant progress, fragments/previews, and follow-up prompts. That should be powered by the same agent runtime contract, not by copying web UI assumptions into `src/agent`.

The architecture can handle this if the boundary stays clear:

- `src/agent` remains the headless harness: domain state, runtime events, application use cases, ports, and concrete adapters.
- `src/interfaces/cli` becomes a delivery mechanism with its own app shell, state reducer, and terminal presentation components.
- Shared CLI/non-CLI contracts stay in `src/agent`, `src/shared`, or feature application ports only when more than the CLI needs them.

## What "after" looks like

Keep a non-interactive path for scripts, but add an interactive app entrypoint:

```txt
npm run agent:local                       # interactive Ink app when stdout is a TTY
npm run agent:local -- chat               # explicit interactive app
npm run agent:local -- run "fix the form" # one-shot/headless compatibility
npm run agent:local -- --json "fix it"    # JSONL compatibility for automation
```

Target folder shape:

```txt
src/interfaces/cli/
  agent-local.ts                # thin entrypoint and command routing
  args.ts                       # cac parsing and mode resolution
  runtime/
    compose-deps.ts             # model/sandbox/store/event-sink composition
    run-session.ts              # headless bridge from prompt -> events/result
    session-reducer.ts          # AgentRuntimeEvent -> CLI app state
    types.ts
  app/
    cli-app.tsx                 # Ink root
    keymap.ts
    theme.ts
    components/
      message-list.tsx
      message-bubble.tsx
      prompt-input.tsx
      run-status.tsx
      thought-log.tsx
      verification-list.tsx
      preview-panel.tsx
      project-switcher.tsx
  output/
    jsonl.ts                    # existing JSON mode
    text.ts                     # one-shot text output
```

The terminal UI should consume events, not reach inside the agent:

```ts
const session = createCliAgentSession({
  deps,
  config,
  projectId,
  history,
});

session.onEvent((event) => {
  dispatch({ type: "runtime.event", event });
});

await session.sendPrompt(prompt);
```

The state reducer should be CLI-owned and deterministic:

```ts
type CliAppState = {
  projectId: string;
  messages: CliMessage[];
  activeRun?: {
    status: "planning" | "executing" | "finished" | "failed";
    plan?: PlanOutput;
    attempts: CliAttempt[];
    steps: CliStep[];
    verification: VerificationRecord[];
    usage: UsageTotals;
  };
  preview?: {
    url: string;
    sandboxId: string;
    openCommand?: string;
  };
};
```

Ink dependency choice:

- Ink is a React renderer for CLIs and supports component-style terminal UI with hooks and Flexbox-like layout.
- The current repo uses React `^19.0.1`. Before installing Ink, choose either a stable Ink version compatible with the repo's React version or make the React/React DOM upgrade an explicit first PR. Do not quietly pull in an Ink major that forces unrelated frontend changes.
- Add `ink-testing-library` or equivalent only when there are actual Ink components to test.

## Sequencing

1. **Split the current CLI into seams.** Move argument parsing, output formatting, sandbox summary formatting, and dependency composition out of `agent-local.ts` without changing behavior. Preserve current one-shot and `--json` output. This makes the future Ink app consume stable helpers instead of a monolith.
2. **Introduce a headless CLI session controller.** Add `runtime/run-session.ts` and `runtime/session-reducer.ts`. The controller wraps `runAgent`, accepts a prompt/history/deps, emits `AgentRuntimeEvent`s, and returns the same `AgentRunResult`. The reducer converts runtime events into terminal-app state. This is still not Ink-specific.
3. **Add the first Ink shell.** Add `ink` with the compatible version decision documented in the PR. Render a transcript, prompt input, run status, and compact event stream. The shell should call the session controller and update state through the reducer. Keep `--json` and explicit `run` mode on the non-Ink path.
4. **Add durable conversations.** Integrate with `cli-sqlite-persistence.md` once that store exists: project picker, previous messages, message statuses, telemetry, and follow-up command metadata come from SQLite-backed CLI stores. Until then, the Ink app can run with memory stores and an in-session transcript only.
5. **Add local preview affordances.** Integrate with `cli-local-sandbox.md` once local preview mode exists: show preview URL, open-browser action, sandbox/local mode indicator, and verification status. Keep preview controls in the CLI app, not in `src/agent`.
6. **Polish terminal UX.** Add keyboard shortcuts, scrollback, collapsible thought/tool logs, run cancellation or stop affordance if supported by the underlying process, and terminal-size responsive layouts. Add accessibility-minded plain text fallbacks for narrow terminals or non-TTY output.

Steps 1 and 2 should land before Ink. Step 3 can ship a small but real app. Steps 4 and 5 depend on the SQLite/local-sandbox plans. Step 6 can be incremental.

## Definition of done / verification

- `src/agent` exports no Ink, React, terminal rendering, keybinding, or CLI-specific state.
- One-shot `npm run agent:local -- run "..."` and `--json` remain available for scripts and tests.
- Interactive `npm run agent:local` renders an Ink UI on a TTY and does not corrupt JSON/text output on non-TTY runs.
- The Ink app can send a prompt, show user and assistant messages, update live status from `AgentRuntimeEvent`s, show planner output, attempts, step/tool progress, verification rows, token usage, final output, errors, and sandbox/preview metadata.
- CLI state transitions are covered by reducer tests that use plain objects and runtime events, without rendering Ink.
- Ink component tests cover transcript rendering, prompt submission, active-run status, error state, and narrow terminal behavior using a terminal UI test helper.
- Session/controller tests use fake model, sandbox, message, telemetry, and event ports; they do not call E2B, model providers, SQLite, or a browser.
- Verification commands: narrow Vitest tests for `src/interfaces/cli/runtime/` first, Ink component tests when UI lands, then lint/type checks because this touches CLI exports and React/TSX compilation.

## Out of scope

- Moving web presentation components into the CLI or sharing React DOM UI with Ink. Web UI and terminal UI should share data/contracts, not components.
- Rewriting `src/agent` around UI concepts. New agent fields/events are allowed only when both web/Inngest/CLI runtime consumers benefit.
- Completing SQLite persistence or local sandbox support inside this plan. This plan integrates with those plans after their first slices exist.
- Building a full-screen terminal IDE with file editor/diff viewer in the first pass.
- Offline model/provider work. The terminal app can expose provider state, but model routing remains owned by the existing model gateway and related plans.

## Conflicts checked

Checked `docs/plans/open/` and `docs/plans/drift/`. This plan depends on, but does not replace, `cli-sqlite-persistence.md` for durable local messages and `cli-local-sandbox.md` for local preview/sandbox behavior. It uses the same CLI area as those plans, so implementation PRs should land in the order: CLI seams/session controller, SQLite/local sandbox foundations, then richer Ink features. It does not overlap with `agent-telemetry-refactor`, `openrouter-model-route-fallbacks`, `sandbox-auto-revive.md`, or `enforce-dumb-presentation-views.md`. `docs/plans/drift/` contains only its README.

## References

- Ink README: https://github.com/vadimdemedes/ink
- Ink testing library: https://www.npmjs.com/package/ink-testing-library
