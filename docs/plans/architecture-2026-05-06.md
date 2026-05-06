# Architecture refactor — 2026-05-06

## Shallow modules identified

- `src/shared/prompts/index.ts`, `src/shared/prompts/assemble.ts`, `src/shared/prompts/ask.ts`, `src/shared/prompts/planner.ts`, `src/shared/prompts/naming.ts`, `src/shared/prompts/executor.ts`, `src/shared/prompts/sections.ts` — seven tiny prompt files with a barrel surface that exports individual constants; `executor.ts` imports two prompt siblings and callers import multiple named prompt fragments instead of one prompt boundary.
- `src/platform/models/index.ts`, `src/platform/models/constants.ts`, `src/platform/models/factory.ts`, `src/platform/models/types.ts` — route constants, provider construction, fallback resolution, key resolution, and public model types are split across a barrel and several small sibling modules; tests reset modules and import multiple siblings to exercise one routing behavior.
- `src/platform/rate-limit/index.ts`, `src/platform/rate-limit/types.ts`, `src/platform/rate-limit/constants.ts`, `src/platform/rate-limit/factory.ts`, `src/platform/rate-limit/consume.ts` — only `consumeRateLimit` is used by product callers, but the barrel exposes hash/factory/constants/types as peer public concepts.
- `src/features/messages/application/index.ts`, `src/features/messages/application/assistant-messages.ts`, `src/features/messages/application/create-message.ts`, `src/features/messages/application/list-messages.ts`, `src/features/messages/application/repository.ts`, `src/features/messages/application/types.ts` — many one-method wrappers around a wide repository; tests for one function must stub unrelated repository methods.
- `src/features/projects/application/index.ts`, `src/features/projects/application/create-project.ts`, `src/features/projects/application/get-project.ts`, `src/features/projects/application/list-projects.ts`, `src/features/projects/application/rename-project.ts`, `src/features/projects/application/naming.ts`, `src/features/projects/application/repository.ts`, `src/features/projects/application/types.ts` — several very small use-case files share one broad repository and a barrel that exports every helper; tests stub repository members unrelated to the behavior under test.

## Proposed deep modules

### imaginate-agent-prompts

- **Folds in:** `src/shared/prompts/assemble.ts`, `src/shared/prompts/ask.ts`, `src/shared/prompts/planner.ts`, `src/shared/prompts/naming.ts`, `src/shared/prompts/executor.ts`, `src/shared/prompts/sections.ts`, and `src/shared/prompts/index.ts`.
- **Public surface:** `getAgentPrompts`, `buildExecutorSystemPrompt`, `CACHE_PROVIDER_OPTIONS`, `AgentPrompts`.
- **Test boundary:** A single prompt-composition test that calls `getAgentPrompts()` and `buildExecutorSystemPrompt(planSnippet)` and asserts the planner/ask/naming/executor strings include required sections and cache boundaries.
- **Migration:** Keep this inside `src/shared/prompts` so existing architecture direction remains valid. Replace imports of `PLANNER_PROMPT`, `ASK_AGENT_PROMPT`, `PROJECT_NAMING_PROMPT`, and `EXECUTOR_PROMPT_BASE` with `const prompts = getAgentPrompts()` and read `prompts.planner`, `prompts.ask`, `prompts.projectNaming`, or `prompts.executorBase`. Internal section constants stop being exported.

### imaginate-model-routing

- **Folds in:** `src/platform/models/constants.ts`, `src/platform/models/factory.ts`, `src/platform/models/types.ts`, and the routing exports from `src/platform/models/index.ts`. Leave `src/platform/models/messages.ts` out because it is message-history persistence mapping, not model routing.
- **Public surface:** `createModelProvider`, `resolvePlannerModel`, `resolveExecutorModels`, `resolveFallbackSlugs`, `resolveSpecWith`, `ModelSpec`, `ResolvedModelConfig`.
- **Test boundary:** One routing test seam that injects an env-like model selection object and a provider-key resolver, then asserts planner resolution, executor ladder order, LM Studio resolution, and OpenRouter fallback slugs without resetting multiple sibling modules.
- **Migration:** Keep the module under `src/platform/models` to preserve `platform -> shared/generated` direction. Callers that currently import `EXECUTOR_LADDER`, `fallbackSlugsFor`, `resolveSpec`, or `resolvePlannerModel` switch to `resolveExecutorModels()` and `resolveFallbackSlugs(primary)`. The AI SDK adapter still consumes platform only through the small routing surface.

### imaginate-rate-limit-guard

- **Folds in:** `src/platform/rate-limit/types.ts`, `src/platform/rate-limit/constants.ts`, `src/platform/rate-limit/factory.ts`, `src/platform/rate-limit/consume.ts`, and `src/platform/rate-limit/index.ts`.
- **Public surface:** `createRateLimitGuard`, `consumeRateLimit`, `RateLimitConfig`, `RateLimiter`.
- **Test boundary:** A guard-level test with an injected limiter, environment mode, and fallback key; it asserts development bypass, key hashing, accepted consumption, and `TOO_MANY_REQUESTS` translation through one public function.
- **Migration:** Keep the module under `src/platform/rate-limit`. `src/interfaces/trpc/procedures/*` can continue importing `consumeRateLimit`; tests and any future custom rate-limit wiring should use `createRateLimitGuard(...)` instead of reaching into `hashKey`, constants, or the Prisma factory.

### imaginate-message-workflow

- **Folds in:** `src/features/messages/application/assistant-messages.ts`, `src/features/messages/application/create-message.ts`, `src/features/messages/application/list-messages.ts`, `src/features/messages/application/repository.ts`, `src/features/messages/application/types.ts`, and `src/features/messages/application/index.ts`.
- **Public surface:** `createMessageWorkflow`, `MessageWorkflow`, `MessageRepository`, `MessageProjectNotFoundError`, `ProjectMessage`, `MessageAgentRunIntent`.
- **Test boundary:** A workflow-level test using a small in-memory message repository fixture. The test exercises user-message creation, pending/result/error assistant messages, thought updates, and list-by-project through `createMessageWorkflow(...)` without stubbing unrelated methods per test.
- **Migration:** Keep this under `src/features/messages/application` so `interfaces` and feature adapters still depend in the same direction. Callers replace individual wrapper imports like `createPendingCodeAssistantMessage`, `completeCodeAssistantMessage`, and `recordAssistantThoughts` with methods on `const messages = createMessageWorkflow({ repository })`. The Prisma adapter continues to implement `MessageRepository`.

### imaginate-project-workflow

- **Folds in:** `src/features/projects/application/create-project.ts`, `src/features/projects/application/get-project.ts`, `src/features/projects/application/list-projects.ts`, `src/features/projects/application/rename-project.ts`, `src/features/projects/application/naming.ts`, `src/features/projects/application/repository.ts`, `src/features/projects/application/types.ts`, and `src/features/projects/application/index.ts`.
- **Public surface:** `createProjectWorkflow`, `ProjectWorkflow`, `ProjectRepository`, `ProjectNameGenerator`, `ProjectNotFoundError`, `AgentRunIntent`, `ProjectRenameIntent`.
- **Test boundary:** A workflow-level test with an in-memory project repository and optional name generator. The seam covers create/list/get/rename behavior and naming fallback without each test rebuilding a full repository stub.
- **Migration:** Keep this under `src/features/projects/application`. `src/interfaces/trpc/procedures/projects.ts` and `src/interfaces/inngest/functions.ts` construct `const projects = createProjectWorkflow({ repository, nameGenerator })` and call methods on that object. The pure naming helpers become private implementation details unless a caller truly needs a standalone name sanitizer, in which case that should be split into a separate shared utility rather than kept on the project workflow surface.

## Out of scope

- `src/agent/ports/*` — most files are intentionally tiny by architecture. They are ports, not behavior modules, and keeping one port per file makes dependency direction explicit.
- `src/agent/domain/*` — the folder has a wide barrel, but the individual modules are pure, independently tested, and cohesive (`errors`, `edits`, `state`, `telemetry`, `decisions`). A future cleanup could narrow `src/agent/domain/index.ts`, but folding the domain wholesale would make the runtime core broader rather than deeper.
- `src/ui/components/ui/*` — many files are small and export multiple component primitives, but this is a shadcn-style UI primitive collection. The shallow signal is expected and not a good target for domain-oriented deep modules.
- `src/platform/models/messages.ts` — considered with model routing, but it queries persisted message history and maps Prisma rows to AI messages. Folding it into routing would blur infrastructure responsibilities.
- Top-level barrels such as `src/agent/index.ts`, `src/features/messages/index.ts`, and `src/features/projects/index.ts` — they are public package surfaces required by the current architecture contract. Refactoring them should follow from the deeper module migrations above, not be done as a standalone barrel purge.
