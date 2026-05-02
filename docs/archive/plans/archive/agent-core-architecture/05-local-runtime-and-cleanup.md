# Platform Cleanup And Legacy Removal

## Goal

Finish the architecture migration after chunk 04 by moving the remaining `src/lib/**` infrastructure into `src/platform`, `src/shared`, or existing target layers, then remove the final `legacy-lib` boundary exception.

## The problem

Chunk 04 moves tRPC, Inngest, the CLI, and product modules into `src/interfaces` and `src/features`. The remaining architecture gap is `src/lib/**`, which still contains concrete infrastructure and shared helpers used by agent adapters, interfaces, features, and UI:

- database, provider, model, sandbox, logging, rate-limit, and config helpers;
- prompt builders and provider-error classification;
- shared utilities and schemas.

As long as `legacy-lib` exists in `eslint.config.mjs`, lint still allows imports from the retired `src/lib` layer.

## What "after" looks like

The final cleanup should move remaining responsibilities into documented homes:

```txt
src/platform/   concrete shared infrastructure
src/shared/     framework-neutral helpers and schemas
src/agent/      agent-owned prompts/model/provider behavior if it is runtime-specific
src/ui/         UI-only helpers
```

After the move, `eslint.config.mjs` contains only target boundary elements: `app`, `interfaces`, `agent-domain`, `agent-application`, `agent-ports`, `agent-adapters`, `agent-testing`, `features`, `platform`, `ui`, `shared`, and `generated`.

## Sequencing

1. Classify every remaining `src/lib/**` module into `platform`, `shared`, `agent`, or `ui` according to `docs/architecture/architecture.md`.
2. Move modules in small groups and update imports to public target-layer surfaces.
3. Preserve `npm run agent:local` behavior from `src/interfaces/cli`; fix the known output-shape parity gap if it still exists after the move.
4. Remove `legacy-lib` from `eslint.config.mjs`, including the temporary allow-list entries granted to `agent-adapters`, `features`, `interfaces`, and `ui`.
5. Run the boundary smoke check from chunk 01 by temporarily introducing a forbidden import, confirming lint fails, and reverting the smoke edit.
6. Retire the completed migration plans under `docs/plans/` after durable facts have been folded into source-of-truth docs.

## Definition of done / Verification

- `src/lib` is gone.
- `eslint.config.mjs` contains zero `legacy-*` boundary elements and zero `// removed by chunk NN` comments.
- `npm run agent:local -- --help` still works from `src/interfaces/cli`.
- `npm run lint`, `npm run test`, and `npm run build` pass.
- Documentation points future agents only to `src/agent`, `src/interfaces`, `src/features`, `src/platform`, `src/ui`, and `src/shared`.
- Superseded plans have been archived or deleted according to `docs/plans/AGENTS.md`.

## Out of scope

- A full interactive terminal UI.
- Cloud eval orchestration.
- A telemetry dashboard.
- Inngest retry/error policy changes.
- Backwards compatibility for internal import paths after the breaking migration is complete.

## Conflicts checked

This chunk follows chunk 04's interface and feature move. It owns only the remaining `src/lib` cleanup, final boundary tightening, and plan retirement work.
