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
- Runtime event streaming, preview readiness checks, final output, verification rows, files written, token usage, sandbox URL, and a follow-up command.

Under the target architecture, local execution should be just another interface over `src/agent/application`, not a standalone script that imports the old `src/lib/agents` surface directly. It should also keep parity with the current script features so the CLI stays a good agent-development loop.

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
src/lib/agents/        removed or reduced to non-agent shared pieces
src/inngest/           removed after src/interfaces/inngest owns it
src/trpc/              removed after src/interfaces/trpc owns it
src/modules/           removed after src/features owns it
scripts/agent-local.ts removed after src/interfaces/cli owns it
```

## Sequencing

1. Move `scripts/agent-local.ts` to `src/interfaces/cli/agent-local.ts` and update `package.json`.
2. Split argument parsing and output formatting into small CLI-owned helpers if that makes the entrypoint easier to maintain.
3. Preserve current flags and behavior: positional prompt, `--prompt`, `--sandbox-template`, `--sandbox-id`, `--json`, event streaming, preview readiness, final output, verification rows, files written, usage, sandbox URL, and follow-up command.
4. Move any script-only helper documentation from `scripts/README.md` to the architecture doc or a focused development doc if usage details are too long for `architecture.md`.
5. Add local workspace, in-memory store, file telemetry, and terminal event sink adapters as needed under `src/agent/adapters`.
6. Add focused tests for CLI argument parsing, output formatting, and sandbox follow-up command generation without requiring a real E2B sandbox.
7. Delete temporary compatibility shims and update imports to public surfaces.
8. Tighten the `eslint-plugin-boundaries` config in `eslint.config.mjs`: remove every `legacy-*` element introduced in chunk 1 (`legacy-lib-agents`, `legacy-modules`, `legacy-inngest`, `legacy-trpc`, `legacy-app-routes`, `legacy-ui`) along with their `// removed by chunk NN` exception entries, and confirm any rule still in warning mode is flipped to error. After this chunk, the only element types in the config are the target elements (`app`, `interfaces`, `agent-domain`, `agent-application`, `agent-ports`, `agent-adapters`, `features`, `platform`, `ui`, `shared`, `generated`).
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
