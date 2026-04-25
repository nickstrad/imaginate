# Testability refactor

Follow-up plans deferred from the testability refactor (Phases 7–9). Each one was carved out so the original PR could ship; this folder is the queue for finishing the job.

The goal across all plans: stop `src/inngest/functions.ts`, `src/lib/agents/tools.ts`, and the TRPC procedures from binding directly to E2B and Prisma so the orchestrator and tools become unit-testable with in-memory fakes.

## Order

Numbered to reflect dependencies — earlier plans are foundations for later ones. Plans within the same phase can ship together when noted.

1. **[01-prisma-repository-layer](./01-prisma-repository-layer.md)** — repo interfaces over Prisma so procedures and Inngest can be faked. Foundation for several later plans.
2. **[02-sandbox-ops-interface](./02-sandbox-ops-interface.md)** — narrow `SandboxOps` interface so tools stop importing E2B types. Ship together with #03.
3. **[03-define-tool-factory](./03-define-tool-factory.md)** — `defineTool` to centralize per-tool boilerplate. Ship together with #02 (both rewrite `tools.ts`).
4. **[04-run-state-reducers](./04-run-state-reducers.md)** — pure reducers replacing inline `runState` mutations. Foundation for #07.
5. **[05-with-sandbox-lifecycle](./05-with-sandbox-lifecycle.md)** — extract sandbox creation/readiness from `functions.ts`. Depends on #02.
6. **[06-persist-run-helper](./06-persist-run-helper.md)** — bundle post-run writes (final message + telemetry). Depends on #01.
7. **[07-split-executor-step-callback](./07-split-executor-step-callback.md)** — split `onStepFinish` into a pure reducer + I/O helper. Depends on #04 and #01.
8. **[08-inngest-functions-integration-tests](./08-inngest-functions-integration-tests.md)** — colocated tests covering the orchestrator paths now that fakes are possible. Depends on #01, #02, #05, #06.
9. **[09-project-rename-inngest-event](./09-project-rename-inngest-event.md)** — convert fire-and-forget rename to a typed Inngest event. Backlog/optional; revisit if rename observability becomes a concern.
