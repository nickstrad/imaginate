# Local Runtime And Cleanup

## Goal

Make the first-class agent runtime usable outside the web app, then remove legacy compatibility shims so the new architecture is the only supported shape.

## The problem

The agent should be developable without booting the full Next/Inngest stack. The existing `agent-runtime-decoupling` plan already identifies this need with a local command, but under the old structure the local path still depends on extracting orchestration into `src/lib/agents`. Under the new architecture, local execution should be just another interface over `src/agent/application`.

## What "after" looks like

Add a local interface:

```txt
src/interfaces/cli/
  agent-local.ts
```

Add package scripts only after the runtime and adapters exist:

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
src/lib/agents/        removed or reduced to migration-free shared pieces
src/inngest/           removed after src/interfaces/inngest owns it
src/trpc/              removed after src/interfaces/trpc owns it
src/modules/           removed after src/features owns it
```

## Sequencing

1. Add `agent:local` and a CLI/script entrypoint under `src/interfaces/cli`.
2. Add local workspace, in-memory store, file telemetry, and terminal event sink adapters as needed.
3. Document the local command in the architecture doc or a focused development doc if usage details are too long for `architecture.md`.
4. Delete temporary compatibility shims and update imports to public surfaces.
5. Tighten lint rules from warning or exception-heavy mode to strict error mode.
6. Move superseded plans or update them to point at this architecture once the migration lands.

## Definition of done / Verification

- `npm run agent:local -- "<prompt>"` can run the agent without the Next dev server or Inngest dev server.
- The local path and Inngest path call the same `runAgent` application code.
- Temporary re-export shims for old `src/lib/agents`, `src/modules`, `src/trpc`, and `src/inngest` paths are gone.
- Boundary lint rules run in strict mode with no architecture exceptions for migrated code.
- Documentation points future agents to `src/agent`, `src/interfaces`, `src/features`, `src/platform`, `src/ui`, and `src/shared`.

## Out of scope

- A full interactive CLI product.
- Cloud eval orchestration.
- A telemetry dashboard.
- Backwards compatibility for internal import paths after the breaking migration is complete.

## Conflicts checked

This chunk overlaps with `agent-runtime-decoupling/04-local-script.md` but changes the destination and dependency model. The local script should be implemented as an interface over `src/agent/application`, not as a script over `src/lib/agents`.
