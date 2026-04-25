# Refactor Follow-ups

Deferred from the testability refactor (Phases 0–8 landed; see initial PR).

## Phase 7 deeper split — TRPC procedures

- Replace fire-and-forget `renameProjectInBackground` with a dedicated Inngest event (`project/rename`) so failures are observable and retryable.
- Introduce a Prisma repository layer (`projectRepo.create`, `projectRepo.evictOldest`, `messageRepo.create`) so procedures depend on a thin interface and can be tested end-to-end against an in-memory fake.
- Move the raw-SQL eviction (`prisma.$executeRaw`) into the repo with a documented justification (race-free + single round-trip) — and consider a Prisma-native equivalent if portability becomes a concern.

## Phase 8 deeper split — agent-tools

- Introduce a single `defineTool({ name, run, mutate })` factory so each of the ~10 tools no longer redeclares its closure plumbing (try/catch, run-state mutation, error serialization).
- Define a `SandboxOps` interface (`exec`, `readFile`, `writeFile`, `listFiles`) that tools call instead of touching the E2B `Sandbox` object directly. Default impl wraps the real sandbox; tests pass a fake.
- Centralize state mutations through `RunState` reducers (already partially done in agent-config) so tool bodies can be pure.

## Phase 9 full — functions.ts decomposition

- Decompose `codeAgentFunction` (lines ~440–641 of `src/inngest/functions.ts`) into:
  - `runPlanner(deps, input) → Plan` — AI call is the only seam.
  - `prepareSandbox(deps, plan)` — sandbox creation + teardown wrapper that **guarantees cleanup on every error path** (currently missing).
  - `runExecutorLadder(deps, plan, ladder)` — declarative loop driven by `shouldEscalate` (already extracted to `agent-decisions.ts`).
  - `persistRun(deps, telemetry)` — uses `persistTelemetryWith` from `agent-telemetry`.
- `runExecutorOnce` (lines ~223–347): split the step callback into `onToolStep(state, step) → state'` (pure) + `recordStep(deps, step)` (I/O).
- Add integration tests covering: success, mid-ladder failure with retry, full-ladder exhaustion, transient retry, and verification-required escalation paths — using fake AI + fake `SandboxOps` + fake Prisma.

## Out of scope still

- `messages-container.tsx` — needs a React Testing Library + TRPC test harness; track separately.
