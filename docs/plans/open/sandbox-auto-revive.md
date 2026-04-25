# Sandbox Auto-Revive — Pre-Plan

## Problem

E2B sandboxes are created per agent run with a 30-min TTL. When a user reopens a project the next day, the sandbox is dead and the stored `sandboxUrl` iframe is broken. There is no reconnect or revival path today.

## Current State

- Sandbox created in `src/inngest/functions.ts:181` via `Sandbox.create("imaginate-dev")`.
- `SANDBOX_TIMEOUT = 30 * 60 * 1000` in `src/inngest/utils.ts:3`.
- `getSandbox()` (utils.ts) calls `Sandbox.connect()` + `setTimeout` — only used within an active run.
- Sandbox ID is **not** persisted. Only `sandboxUrl` is stored on fragments.
- `src/app/projects/[projectId]/page.tsx` and `fragment-web.tsx` render the stored URL with no liveness check.
- Prisma `Project` model has no sandbox fields.

## Key Constraint

E2B sandboxes do **not** retain filesystem state after expiry. "Revive" means create a fresh sandbox and rebuild project state from DB (messages/fragments) — not reconnect to the old one.

## Options

### 1. Reactive revive on next chat message (cheapest)

- Add `sandboxId` to `Project` in Prisma.
- In inngest run: try `Sandbox.connect(storedId)`; on failure, create new + replay init.
- No change to page-open UX; stale iframe stays broken until user sends a message.

### 2. Proactive revive on chat open

- tRPC mutation `projects.ensureSandbox` called from project page `useEffect`.
- Attempts connect, else creates + re-scaffolds, updates `sandboxUrl`.
- Iframe blocks on completion.
- Cost: spins up a sandbox every time a project is opened.

### 3. Liveness probe + manual resume (recommended)

- HEAD the `sandboxUrl` on page load.
- On failure, show "Sandbox expired — resume" CTA that runs option 2's flow.
- Avoids burning sandbox minutes on idle tab-opens.

## Open Questions

- What exactly needs replaying to rebuild sandbox state? (files written by past agent runs, installed deps, running dev server)
- Is replay deterministic from the message/fragment history, or do we need a snapshot/manifest?
- Should revive re-run the last agent turn, or just restore the file tree + `npm install` + `npm run dev`?
- Billing/quotas: any cap on concurrent sandboxes per user?

## Next Steps

1. Decide option (likely 3).
2. Spec the "rebuild state" procedure — this is the real work, not the connect/create dance.
3. Add `sandboxId` + last-known-state field to `Project`.
4. Implement probe + resume mutation.
