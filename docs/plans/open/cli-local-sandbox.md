# CLI local sandbox

## Goal

Let `npm run agent:local` run against a local, browser-openable workspace without calling the E2B sandbox API. The first useful version should be boring: fill the existing `SandboxGateway` port with local filesystem/process behavior, start or discover the preview server, and open Chrome or a browser to `http://localhost:<port>`. Docker isolation can come after the local loop works.

## The problem

The architecture contract says the CLI is a first-class interface and may compose the agent runtime with "local workspace or in-memory stores" ("CLI as a first-class interface"). The code already has the beginning of that shape:

- `src/agent/ports/sandbox-gateway.ts` defines the runtime surface the agent needs: `commands.run`, `files.read/write`, `setTimeout`, and `getHost`.
- `src/agent/adapters/local-workspace/sandbox-gateway.ts` implements that surface with `node:fs/promises` and `node:child_process` against a local root, but its header says it is "not yet selected by callers".
- `src/interfaces/cli/agent-local.ts` still eagerly calls `Sandbox.create()` or `Sandbox.connect()` from `@e2b/code-interpreter`, then wraps that sandbox with `createE2bSandboxGateway`.
- The CLI's sandbox URL handling assumes E2B hostnames and `ensurePreviewReady`, so there is no local `http://localhost:<port>` preview or browser-open path.

That means local CLI runs still depend on sandbox API availability even when the desired behavior is just "edit files here, run commands here, and let me inspect the result locally."

## What "after" looks like

Add an explicit sandbox mode to the CLI:

```txt
npm run agent:local -- --sandbox e2b "build the page"
npm run agent:local -- --sandbox local --workspace . "build the page"
npm run agent:local -- --sandbox local --workspace . --preview-port 3000 --open "build the page"
npm run agent:local -- --sandbox docker --workspace . --open "build the page"
```

The local mode should compose the existing port rather than special-case the agent runtime:

```ts
const sandboxGateway =
  args.sandbox === "local"
    ? createLocalWorkspaceGateway({
        root: args.workspace,
        previewPort: args.previewPort,
      })
    : createE2bSandboxGateway({ sandboxId });

const sandboxSummary =
  args.sandbox === "local"
    ? {
        sandboxId: `local:${args.workspace}`,
        sandboxUrl: `http://localhost:${args.previewPort}`,
        followUpCommand: formatLocalFollowUpCommand(args),
      }
    : summarizeSandbox(e2bSandbox);
```

Target structure:

```txt
src/agent/adapters/local-workspace/
  sandbox-gateway.ts       # harden path/process behavior and localhost getHost
  preview.ts               # start/probe local preview commands
  browser.ts               # optional browser opener abstraction
  *.test.ts

src/interfaces/cli/
  agent-local.ts           # parse flags, choose sandbox mode, print/open URL
```

Local preview behavior should be explicit and debuggable:

```txt
--workspace <path>          root where files are read/written and commands run
--preview-port <number>     default 3000
--preview-command <cmd>     default npm run dev -- --hostname 127.0.0.1 --port <port>
--open                      open the preview URL after it responds
--no-preview                skip starting/probing/opening a browser
```

Dependency choice:

- First pass: use Node's built-in `child_process`, `fs`, and `http`/`fetch` APIs. No Docker SDK is required for local mode.
- Browser open can start as a tiny platform helper that runs `open -a "Google Chrome" <url>` on macOS and falls back to the default browser. If controlled browser profiles become valuable, Playwright's `launchPersistentContext(userDataDir)` supports a persistent local profile.
- Docker should be an optional later mode. Docker's official Engine SDKs are Go and Python; for Node, Docker documents community libraries such as `dockerode`, or the Engine HTTP API can be used directly. For this repo, prefer shelling out to the Docker CLI or using the Engine API through a narrow adapter before adding a broad dependency.

## Sequencing

1. **Wire local mode into the CLI.** Add `--sandbox e2b|local`, `--workspace`, `--preview-port`, `--preview-command`, `--open`, and `--no-preview`. Keep `e2b` as the default initially. Move E2B provisioning behind an `e2b` branch so `--sandbox local` performs no E2B API calls.
2. **Harden the local workspace adapter.** Keep it under `src/agent/adapters/local-workspace/`, but make path handling safer: resolve all file paths inside the configured root unless an explicit unsafe/debug flag is added later. Ensure command timeouts return a non-zero result when the child is killed. Make `getHost(port)` return `127.0.0.1:<port>` or a URL-ready host that CLI formatting can use.
3. **Add local preview management.** Implement a small helper that can start `--preview-command`, probe `http://127.0.0.1:<port>`, stream preview logs into CLI output, and clean up the child process on exit. Do not hide failures: if the preview never becomes ready, print the command and log tail.
4. **Add browser opening.** Implement `--open` through a CLI-owned browser opener. Prefer opening the local URL after the preview probe succeeds. Keep this separate from `SandboxGateway`; opening a browser is delivery/UI behavior, not agent runtime behavior.
5. **Add optional isolated mode.** After local mode works, add `--sandbox docker` only if the team still wants filesystem/process isolation. Use a small Dockerfile or image contract that mounts/copies the workspace, exposes the preview port, and implements the same `SandboxGateway` shape. This should be a separate PR because it adds dependency, image, and cleanup risk.

Steps 1 and 2 should ship together because selecting the current local adapter without hardening path and timeout behavior would make the CLI surprising. Step 3 is the browser-inspection payoff. Step 4 is polish. Step 5 is deliberately later.

## Definition of done / verification

- `npm run agent:local -- --sandbox local --workspace <tmp-project> ...` never calls `Sandbox.create`, `Sandbox.connect`, or `getSandbox`.
- In local mode, agent file reads/writes happen under the configured workspace and commands run with that workspace as `cwd`.
- Local mode prints a localhost preview URL and a follow-up command that preserves `--sandbox local`, `--workspace`, and preview flags.
- `--open` opens the local preview only after the preview probe succeeds, and failure to open the browser does not fail an otherwise successful agent run.
- `--no-preview` allows purely terminal/offline runs with no dev server or browser behavior.
- Unit tests cover CLI argument parsing, sandbox-mode dependency selection, local path containment, command timeout behavior, preview probing, and browser opener fallback behavior using fakes.
- Integration-style tests cover local mode against a temporary fixture project without E2B, model providers, Docker, or a real browser.
- Verification commands: narrow Vitest tests for `src/agent/adapters/local-workspace/` and `src/interfaces/cli/agent-local.ts`, then lint/type checks because this changes exported adapter wiring and CLI argument flow.

## Out of scope

- Replacing model-provider API calls with an offline LLM. This plan removes sandbox API calls; model calls remain controlled by the existing model gateway unless a separate mock/offline-model plan is created.
- Making the web/Inngest path use the local sandbox adapter.
- Full security isolation for arbitrary untrusted code in the first local mode. Local mode runs commands on the user's machine and should be labeled accordingly.
- Persisting local project history. That belongs to `docs/plans/open/cli-sqlite-persistence.md`.
- E2B sandbox revive or reconnect behavior. That belongs to `docs/plans/open/sandbox-auto-revive.md`.
- A polished local project browser UI. This plan only opens the app preview in a browser.

## Conflicts checked

Checked `docs/plans/open/` and `docs/plans/drift/`. This plan complements `cli-sqlite-persistence.md`: SQLite owns durable local history, while this plan owns local filesystem/process/preview execution. It touches sandbox concepts but does not change E2B lifecycle, so `sandbox-auto-revive.md` remains separate. It does not overlap with `agent-telemetry-refactor`, `openrouter-model-route-fallbacks`, or `enforce-dumb-presentation-views`. `docs/plans/drift/` contains only its README.

## References

- Docker Engine SDK docs: https://docs.docker.com/reference/api/engine/sdk/
- Docker Engine API docs: https://docs.docker.com/reference/api/engine/
- Playwright persistent context docs: https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context
