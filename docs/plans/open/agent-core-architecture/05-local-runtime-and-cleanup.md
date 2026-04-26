# Local Runtime And Cleanup

## Goal

Move the existing local agent runtime into the new interface layer, keep it useful as a first-class way to improve the agent without the web app, then remove legacy compatibility shims so the new architecture is the only supported shape.

## The problem

The local runtime already exists as `npm run agent:local` backed by `scripts/agent-local.ts`. That command is valuable because it lets agent work happen without booting the Next app, tRPC route, or Inngest dev server.

Today the CLI already supports:

- Positional prompts or `--prompt`.
- Creating a new E2B sandbox with `--sandbox-template`.
- Continuing in an existing sandbox with `--sandbox-id`.
- JSONL output with `--json` for scripts and future harnesses.
- Runtime event streaming, preview readiness checks, final output, sandbox URL, and a follow-up command.
- `dotenv/config` auto-loading so the script reads `.env` without shell exports.

Chunk 03 already moved the CLI to call `runAgent` through `@/agent` (`createAiSdkModelGateway`, `createE2bSandboxGateway`, `createAiSdkToolFactory`, `createInMemoryMessageStore`, `createNoopTelemetryStore`, `createTerminalEventSink`). The remaining work is the folder relocation, output-shape parity gap, and the cleanup of legacy boundary elements.

Output-shape gap to close in this chunk: when the CLI was rewired to call top-level `runAgent`, it lost direct visibility into `runState.filesWritten` and the live verification list (since `runAgent` returns only `AgentRunResult`). The CLI currently shows `[]` for files written and uses `finalOutput.verification` instead of `runState.verification`. Decide here whether to widen `AgentRunResult` to expose the run state or to have the CLI compose `planRun`/`executeRun` directly the way Inngest does.

## What "after" looks like

Move the local interface into source:

```txt
src/interfaces/cli/
  agent-local.ts
  format.ts
  args.ts
```

Update package scripts after the runtime and adapters exist:

```json
{
  "scripts": {
    "agent:local": "tsx src/interfaces/cli/agent-local.ts"
  }
}
```

The local path uses production-like model adapters but local or in-memory infrastructure where useful:

```ts
await runAgent({
  input,
  deps: {
    modelGateway: createAiSdkModelGateway(),
    sandboxGateway: createLocalWorkspaceGateway(workspacePath),
    messageStore: createInMemoryMessageStore(),
    telemetryStore: createFileTelemetryStore(outputPath),
    eventSink: createTerminalEventSink(),
    logger: createConsoleAgentLogger(),
  },
});
```

The command remains optimized for iterative agent development:

```bash
npm run agent:local -- "add a dark mode toggle"
npm run agent:local -- --sandbox-id sbx_abc123 "now add tests for it"
npm run agent:local -- --json --prompt "summarize the messages module"
```

The output contract should keep the existing useful records:

```txt
runtime.event
outcome.final_output
outcome.verification
outcome.file_written
outcome.usage
sandbox.url
sandbox.follow_up
```

Cleanup removes old surfaces:

```txt
src/inngest/           removed after src/interfaces/inngest owns it (chunk 04)
src/trpc/              removed after src/interfaces/trpc owns it (chunk 04)
src/modules/           removed after src/features owns it (chunk 04)
scripts/agent-local.ts removed after src/interfaces/cli owns it (this chunk)
src/lib/**             concrete infra moves to src/platform; imports updated; legacy-lib element removed
```

`src/lib/agents` was already deleted in chunk 03.

## Sequencing

1. Move `scripts/agent-local.ts` to `src/interfaces/cli/agent-local.ts` and update `package.json`.
2. Split argument parsing and output formatting into small CLI-owned helpers if that makes the entrypoint easier to maintain.
3. Preserve current flags and behavior: positional prompt, `--prompt`, `--sandbox-template`, `--sandbox-id`, `--json`, event streaming, preview readiness, final output, verification rows, files written, usage, sandbox URL, and follow-up command.
4. Move any script-only helper documentation from `scripts/README.md` to the architecture doc or a focused development doc if usage details are too long for `architecture.md`.
5. `local-workspace`, `memory`, and `terminal` adapters already exist (chunk 03). Add a file-backed telemetry adapter (`createFileTelemetryStore`) under `src/agent/adapters/file/` if `--json` runs need persistent telemetry, and wire the CLI to use `createLocalWorkspaceGateway` when no `--sandbox-id` is given.
6. Add focused tests for CLI argument parsing, output formatting, and sandbox follow-up command generation without requiring a real E2B sandbox.
7. Delete temporary compatibility shims and update imports to public surfaces.
8. Tighten the `eslint-plugin-boundaries` config in `eslint.config.mjs`: remove every remaining `legacy-*` element (`legacy-lib`, `legacy-modules`, `legacy-inngest`, `legacy-trpc`) along with their `// removed by chunk NN` exception entries (including the `legacy-lib` allowance currently granted to `agent-adapters` and `ui`), and confirm any rule still in warning mode is flipped to error. After this chunk, the only element types in the config are the target elements (`app`, `interfaces`, `agent-domain`, `agent-application`, `agent-ports`, `agent-adapters`, `agent-testing`, `features`, `platform`, `ui`, `shared`, `generated`).
9. Retire superseded plans under `docs/plans/` once the migration lands: fold durable facts into source-of-truth docs, archive only plans with lasting decision value, and delete plans that were only execution sequencing.

## Definition of done / Verification

- `npm run agent:local -- "<prompt>"` can run the agent without the Next dev server or Inngest dev server.
- `npm run agent:local -- --sandbox-id <id> "<prompt>"` can continue work in an existing sandbox.
- `npm run agent:local -- --json --prompt "<prompt>"` emits machine-readable JSONL records suitable for scripts and future eval harnesses.
- The local path and Inngest path call the same `runAgent` application code.
- CLI output preserves runtime events, final output, verification rows, files written, token usage, sandbox URL, and follow-up command.
- CLI-specific parsing/formatting has focused tests that do not require a real sandbox.
- Temporary re-export shims for old `src/lib/agents`, `src/modules`, `src/trpc`, `src/inngest`, and `scripts/agent-local.ts` paths are gone.
- `eslint.config.mjs` contains zero `legacy-*` boundary elements and zero `// removed by chunk NN` comments; all remaining rules are at error severity.
- A repeat of chunk 1's smoke check passes: a temporarily introduced forbidden import (e.g. `src/agent/domain` importing from `src/app`) still fails lint with a message that names the crossed boundary, and is reverted before merging.
- Documentation points future agents to `src/agent`, `src/interfaces`, `src/features`, `src/platform`, `src/ui`, and `src/shared`.
- Superseded plans have been archived or deleted according to `docs/plans/AGENTS.md`.

## Out of scope

- A full interactive terminal UI.
- Cloud eval orchestration.
- A telemetry dashboard.
- Backwards compatibility for internal import paths after the breaking migration is complete.

## Conflicts checked

This chunk overlaps with the completed local-script work from `agent-runtime-decoupling`, but treats it as existing behavior to preserve and relocate rather than new functionality to build.
