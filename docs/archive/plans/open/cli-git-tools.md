# CLI git tools

## Goal

Give the local CLI coding agent first-class git capabilities — status, diff, branch, checkout, add, commit, log, restore — exposed as agent tools, gated by a permission policy, and interruptible via the harness `AbortSignal`. The agent should be able to inspect history, propose changes on a branch, stage selectively, and commit with a message, while the human in the Ink chat can approve, deny, or interrupt each mutating action.

This plan does not introduce per-run isolation (no auto-worktrees, no auto-branching). The CLI continues to operate directly in `process.cwd()` as `cli-ink-app/` defines. Git is a tool the agent uses inside that workspace, not a sandbox layer around it.

## The problem

Today the agent has `commands.run` and `files.read/write` on `Workspace`. It can technically shell out to `git`, but:

- There is no structured tool surface, so the planner sees git as freeform shell. Tool-call events render as raw command lines instead of `git.diff`/`git.commit` panels.
- There is no per-action permission policy. Once the user approves "run shell commands", `git reset --hard` and `git status` are equally allowed. The harness's `toolCallGate` (introduced by `agent-harness-transport-agnostic/` chunk 06) operates on tool identity; one undifferentiated shell tool defeats it.
- Long-running git operations (large `log`, hooks during `commit`) cannot be cancelled granularly because they are nested inside an opaque shell call.
- The CLI Ink renderer has no way to special-case git output (colored diffs, branch lists) without sniffing command strings.

## What "after" looks like

A narrow `GitGateway` port and a local adapter:

```txt
src/agent/ports/
  git-gateway.ts            # GitGateway interface

src/agent/adapters/local-git/
  git-gateway.ts            # spawns `git` against Workspace root via child_process
  parse.ts                  # parse porcelain output to structured records
  *.test.ts

src/agent/application/tools/
  git-tools.ts              # registers git.* tools onto the executor's ToolFactory
```

Port shape:

```ts
interface GitGateway {
  status(opts: { signal?: AbortSignal }): Promise<GitStatus>;
  diff(opts: {
    staged?: boolean;
    path?: string;
    signal?: AbortSignal;
  }): Promise<GitDiff>;
  log(opts: {
    limit?: number;
    path?: string;
    signal?: AbortSignal;
  }): Promise<GitLogEntry[]>;
  branchList(opts: { signal?: AbortSignal }): Promise<GitBranch[]>;
  branchCreate(opts: {
    name: string;
    from?: string;
    signal?: AbortSignal;
  }): Promise<void>;
  checkout(opts: { ref: string; signal?: AbortSignal }): Promise<void>;
  add(opts: { paths: string[]; signal?: AbortSignal }): Promise<void>;
  restore(opts: {
    paths: string[];
    staged?: boolean;
    signal?: AbortSignal;
  }): Promise<void>;
  commit(opts: { message: string; signal?: AbortSignal }): Promise<GitCommit>;
}
```

Each method becomes a separate agent tool (`git.status`, `git.diff`, `git.commit`, …) so `toolCallGate` can apply per-action policy. Narrow tools, not one mega-tool with subcommands.

Permission policy lives in the CLI (not in the harness):

```ts
// src/interfaces/cli/runtime/git-permissions.ts
type GitPermissionClass = "safe" | "mutating" | "destructive";

const policy: Record<GitToolName, GitPermissionClass> = {
  "git.status": "safe",
  "git.diff": "safe",
  "git.log": "safe",
  "git.branchList": "safe",
  "git.branchCreate": "mutating",
  "git.checkout": "mutating",
  "git.add": "mutating",
  "git.restore": "mutating",
  "git.commit": "mutating",
};
```

The CLI composes a `toolCallGate` that consults this policy: `safe` → auto-approve, `mutating` → prompt in the Ink UI showing the structured args, `destructive` → always prompt and echo the resolved command. Rejection produces a tool result the planner can read ("user denied git.commit"); the run continues.

Interrupts: every `GitGateway` method takes an optional `AbortSignal`. The local adapter wires it to `child_process.spawn`'s signal so Ctrl+C in the Ink app aborts an in-flight `git log` or a running pre-commit hook.

Tool-call events flow through the existing `tool.call.requested` / `tool.call.completed` channel with structured payloads (e.g. `{ tool: "git.diff", args, result: { hunks: [...] } }`), so the CLI Ink renderer can mount diff/commit panels off the tool name without string-sniffing. The renderer contract is owned by `cli-ink-app/` chunk 06.

## Out of scope

- Auto-worktrees or per-run isolation branches. The agent operates in cwd.
- Network-touching git ops: `push`, `pull`, `fetch`, `clone`, remote-tracking config. These need credential and confirmation flows that warrant their own plan.
- `git rebase`, `git merge`, conflict-resolution UX.
- `git reset --hard`, `git clean -fd`, `git checkout -- <path>` overwriting unstaged changes — destructive ops are deferred to a follow-up plan once the safe/mutating loop is stable.
- GitHub API tools (`gh pr create`, etc.). Different surface, different auth.
- Hooks management or skipping (`--no-verify`).
- Multi-repo or submodule awareness.
- Persisting per-tool approval preferences across sessions.

## Sequencing

1. **Land `GitGateway` port + local adapter.** Implement the safe methods first (`status`, `diff`, `log`, `branchList`) with structured parsing of porcelain output, full `AbortSignal` support, and unit tests against a temp-repo fixture.
2. **Register safe git tools on the executor `ToolFactory`.** `git.status`, `git.diff`, `git.log`, `git.branchList`. Tool-call events should carry structured payloads. End-to-end test against the harness using a fixture repo proves the planner can read `status`/`diff` and act on them.
3. **Add mutating tools + CLI permission policy.** `git.branchCreate`, `git.checkout`, `git.add`, `git.restore`, `git.commit`. Add `git-permissions.ts` and a `toolCallGate` composer in `src/interfaces/cli/runtime/` that the Ink app uses to prompt. Headless reducer tests cover approve/deny paths against fixture events.
4. **Ink rendering.** Coordinate with `cli-ink-app/` chunk 06 on the tool-log component contract so the git renderer can mount without forking the panel. Diff payloads render with hunks; commit results show short SHA + subject; denied calls show the denial reason.

Steps 1 and 2 can ship together. Step 3 must wait for harness chunk 06 (`toolCallGate`). Step 4 must coordinate with `cli-ink-app/` chunk 06.

## Definition of done / verification

- Agent has access to `git.status`, `git.diff`, `git.log`, `git.branchList`, `git.branchCreate`, `git.checkout`, `git.add`, `git.restore`, `git.commit` as discrete tools.
- All `GitGateway` methods accept and honor `AbortSignal`; killing the parent run terminates the child `git` process.
- The CLI prompts before every `mutating` git tool call and auto-approves every `safe` call. Denied calls produce a tool result the planner can read; the run continues.
- A denied `git.commit` does not leave staged-but-uncommitted state behind that the agent did not intend.
- Tool-call events carry structured payloads; the Ink tool-log renders git tool calls through a git-aware panel without string-sniffing command lines.
- No CLI code shells out to `git` outside `src/agent/adapters/local-git/`.
- Unit tests cover porcelain parsing for status, diff (with binary + rename), log, and branch list. Adapter tests use a temp-directory git repo fixture.
- Reducer tests cover approve, deny, and abort transitions for at least one safe and one mutating git tool.
- Verification commands: narrow Vitest runs for `src/agent/adapters/local-git/`, the CLI permission composer, and the Ink tool-log integration; then lint/type checks.

## Dependencies & conflicts

- **Depends on `agent-harness-transport-agnostic/`** — needs `toolCallGate` (chunk 06) and `AbortSignal` propagation through `Workspace.commands.run` (chunk 06). Cannot start step 3 until Phase C ships.
- **Depends on `cli-local-sandbox.md`** — git ops run against the same cwd-rooted local `Workspace` that plan delivers. Path containment and command-timeout behavior from that plan apply directly to the git adapter.
- **Coordinates with `cli-ink-app/`** — chunk 06 owns the tool-log component; this plan's renderer mounts into that contract. The two plans must agree on the panel slot interface and the structured payload shape for `tool.call.*` events before chunk 06 ships. Chunk 07's `toolCallGate` integration is the surface this plan composes for prompts.
- **No conflict with** `agent-telemetry-refactor/` — git tool calls flow through the same telemetry channel as other tools; no schema change needed.
- `docs/plans/drift/` contains only its README.

## References

- Git porcelain v2 status format: https://git-scm.com/docs/git-status#_porcelain_format_version_2
- `child_process.spawn` signal handling: https://nodejs.org/api/child_process.html#optionssignal
