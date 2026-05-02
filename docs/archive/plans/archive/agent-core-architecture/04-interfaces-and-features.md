# Interfaces And Features

## Goal

Move delivery mechanisms and product-owned code into the target architecture: `src/interfaces/{trpc,inngest,cli}` and `src/features/*`. Preserve public routes, tRPC procedure names, Inngest behavior, and `npm run agent:local` behavior while removing the legacy `src/modules`, `src/trpc`, `src/inngest`, and `scripts/agent-local.ts` surfaces.

## The problem

After chunk 03, the reusable agent runtime lives under `src/agent`, but product entrypoints still use the old web-app layout:

- tRPC wiring and client helpers live under `src/trpc`.
- Inngest client, events, handlers, and agent adapter live under `src/inngest`.
- Product UI and server procedures live under `src/modules`.
- The local CLI lives at `scripts/agent-local.ts` even though `docs/architecture/architecture.md` names `src/interfaces/cli` as the CLI home.

That keeps delivery, feature workflows, and presentation tangled, and it forces lint to keep `legacy-modules`, `legacy-trpc`, and `legacy-inngest` exceptions alive.

## What "after" looks like

Delivery mechanisms live under `src/interfaces`:

```txt
src/interfaces/
  trpc/
    client.tsx
    init.ts
    server.tsx
    query-client.ts
    routers/
    procedures/
  inngest/
    client.ts
    events.ts
    functions.ts
    agent-adapter.ts
  cli/
    agent-local.ts
```

Product concepts live under `src/features`:

```txt
src/features/
  projects/
    application/
    adapters/
    presentation/
  messages/
    application/
    adapters/
  providers/
    application/
```

tRPC procedures become interface adapters over feature application functions. Queue sends stay in interfaces: feature create workflows return persisted data plus neutral run/rename intents, and the tRPC layer maps those intents to typed Inngest events.

Inngest uses typed event schemas for `codeAgent/run`, `askAgent/run`, and `project/rename`. Project rename moves from fire-and-forget in the tRPC process to a non-user-visible Inngest handler that calls the projects feature rename workflow.

## Sequencing

1. Move `src/trpc` to `src/interfaces/trpc` and update app/client imports without changing `/api/trpc` or public router/procedure names.
2. Move `src/inngest` to `src/interfaces/inngest`, add Zod-backed `EventSchemas`, and update `/api/inngest` to serve code, ask, and project-rename handlers.
3. Move `scripts/agent-local.ts` to `src/interfaces/cli/agent-local.ts` and update `package.json`.
4. Move feature UI from `src/modules` into `src/features/*/presentation`; move shared `ModeSelector` into `src/ui`.
5. Add project/message/provider application functions and Prisma-backed feature repositories.
6. Replace module server procedures with thin tRPC interface adapters, and move project renaming behind a typed Inngest event.
7. Delete legacy `src/modules`, `src/trpc`, `src/inngest`, and `scripts/agent-local.ts`; remove `legacy-modules`, `legacy-trpc`, and `legacy-inngest` from `eslint.config.mjs`.

## Definition of done / Verification

- `src/app` imports only route/layout code, `src/interfaces`, `src/features`, and `src/ui`.
- `src/interfaces` contains tRPC, Inngest, and CLI entrypoints.
- `src/features` contains product workflows, feature repositories, and feature presentation.
- `src/agent` has no imports from `src/features` or `src/interfaces`.
- Existing routes, tRPC calls, Inngest handlers, project rename behavior, and `npm run agent:local` behavior are preserved.
- `npm run lint`, `npm run test`, `npm run build`, and `npm run agent:local -- --help` pass.

## Inngest interface follow-ups

Land with this chunk:

- **Typed event client.** Add `EventSchemas().fromZod(...)` on the Inngest client for `codeAgent/run`, `askAgent/run`, and `project/rename`; handlers read typed `event.data` directly.
- **Project rename event.** Convert background project naming to a typed `project/rename` event handled under `src/interfaces/inngest`, with naming failures remaining non-user-visible.

Explicitly defer retry-policy improvements:

- Do not add function-level `retries` config.
- Do not introduce `NonRetriableError`.
- Do not change provider error save-vs-throw behavior in the code or ask handlers.

## Out of scope

- Redesigning UI components.
- Changing route URLs or public tRPC procedure names.
- Moving generated Prisma output.
- Moving remaining `src/lib/**` infrastructure into `src/platform` or `src/shared`; chunk 05 owns that.
- Inngest retry/error policy improvements after the interfaces/features migration lands.

## Conflicts checked

This chunk intentionally replaces the old `src/modules`, `src/trpc`, `src/inngest`, and `scripts/agent-local.ts` layout inside the `agent-core-architecture` migration. Chunk 05 is adjusted to pick up the remaining `src/lib` cleanup instead of repeating the interface move.
