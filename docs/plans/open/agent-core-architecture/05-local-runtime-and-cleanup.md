# Local Runtime And Cleanup

## Goal

Move the existing local agent runtime into the new interface layer, then remove legacy compatibility shims so the new architecture is the only supported shape.

## The problem

The local runtime already exists as `npm run agent:local` backed by `scripts/agent-local.ts`. That command is valuable and must survive the architecture migration.

Under the target architecture, local execution should be just another interface over `src/agent/application`, not a standalone script that imports the old `src/lib/agents` surface directly.

## What "after" looks like

Move the local interface into source:

```txt
src/interfaces/cli/
  agent-local.ts
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
2. Move any script-only helper documentation from `scripts/README.md` to the architecture doc or a focused development doc if usage details are too long for `architecture.md`.
3. Add local workspace, in-memory store, file telemetry, and terminal event sink adapters as needed under `src/agent/adapters`.
4. Delete temporary compatibility shims and update imports to public surfaces.
5. Tighten lint rules from warning or exception-heavy mode to strict error mode.
6. Move superseded plans or update them to point at this architecture once the migration lands.

## Definition of done / Verification

- `npm run agent:local -- "<prompt>"` can run the agent without the Next dev server or Inngest dev server.
- The local path and Inngest path call the same `runAgent` application code.
- Temporary re-export shims for old `src/lib/agents`, `src/modules`, `src/trpc`, `src/inngest`, and `scripts/agent-local.ts` paths are gone.
- Boundary lint rules run in strict mode with no architecture exceptions for migrated code.
- Documentation points future agents to `src/agent`, `src/interfaces`, `src/features`, `src/platform`, `src/ui`, and `src/shared`.

## Out of scope

- A full interactive CLI product.
- Cloud eval orchestration.
- A telemetry dashboard.
- Backwards compatibility for internal import paths after the breaking migration is complete.

## Conflicts checked

This chunk overlaps with the completed local-script work from `agent-runtime-decoupling`, but treats it as existing behavior to preserve and relocate rather than new functionality to build.
