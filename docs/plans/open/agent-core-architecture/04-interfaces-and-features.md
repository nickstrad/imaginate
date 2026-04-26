# Interfaces And Features

## Goal

Separate delivery mechanisms from product features so web routes, tRPC procedures, Inngest handlers, and scripts call the agent through explicit interfaces instead of sharing mixed framework logic.

## The problem

The current top-level folders combine product and delivery concerns:

- `src/modules/*/server/procedures.ts` couples feature server behavior to tRPC.
- `src/inngest/functions.ts` is now thinner than before, but still lives as a top-level delivery mechanism.
- `src/trpc/routers/_app.ts` is wiring, but procedures still live inside modules.
- `scripts/agent-local.ts` is a local interface outside the `src` architecture.
- `src/app/**` imports views and route handlers according to the existing app/module/trpc/inngest layout.

That structure works for a web app, but it makes the agent feel like an implementation detail of the web/Inngest path instead of a reusable product capability.

## What "after" looks like

Delivery mechanisms move under `src/interfaces`:

```txt
src/interfaces/
  trpc/
    init.ts
    routers/
    procedures/
  inngest/
    client.ts
    events.ts
    functions/
  cli/
    agent-local.ts
```

Product concepts move under `src/features`:

```txt
src/features/
  projects/
    application/
      start-project-agent-run.ts
      rename-project.ts
    adapters/
      prisma-project-repository.ts
    presentation/
      components/
      views/
  messages/
    application/
    adapters/
    presentation/
  providers/
    application/
```

Feature workflows call the agent but the agent does not call features:

```ts
export async function startProjectAgentRun(input: StartProjectAgentRunInput) {
  const project = await projectRepository.getById(input.projectId);
  return runAgent({
    input: toAgentInput(project, input),
    deps: agentDeps,
  });
}
```

## Sequencing

1. Move tRPC wiring from `src/trpc` to `src/interfaces/trpc`, or create `src/interfaces/trpc` as the new home while keeping temporary re-exports.
2. Move Inngest client, events, functions, and agent adapter from `src/inngest` to `src/interfaces/inngest`.
3. Move feature-owned UI and server workflows from `src/modules` to `src/features`.
4. Convert project/message/provider procedures into thin interface adapters over feature application functions.
5. Update `src/app` imports to point at `src/features/*/presentation` and `src/interfaces/*` as appropriate.
6. Keep `scripts/agent-local.ts` in place until chunk 5 moves the local interface, unless moving it here is low-risk after `src/interfaces` exists.
7. Remove temporary module/trpc/inngest shims after imports are migrated.

## Definition of done / Verification

- `src/app` contains Next routes and layouts only.
- `src/interfaces` contains tRPC, Inngest, and script/CLI entrypoints.
- `src/features` contains product-specific workflows and presentation.
- `src/agent` has no imports from `src/features` or `src/interfaces`.
- Existing routes, tRPC calls, Inngest handlers, and the local command preserve user-facing behavior.
- `npm run lint`, `npm run test`, and the relevant build/check command pass.

## Out of scope

- Redesigning UI components.
- Changing route URLs or public tRPC procedure names unless a temporary compatibility layer is explicitly added.
- Moving generated Prisma output.
- Final local CLI cleanup if chunk 5 is a better home for it.

## Conflicts checked

This chunk intentionally replaces the old `src/modules`, `src/trpc`, and `src/inngest` layout. `agent-runtime-decoupling` already made Inngest less central; this chunk moves the remaining delivery and feature folders into the new architecture.
