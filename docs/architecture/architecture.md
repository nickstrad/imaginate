# `src/lib` Architecture

`src/lib` houses framework-agnostic, reusable building blocks. Nothing in `src/lib` may import from `src/inngest`, `src/app`, or `src/modules`. Anything else in the repo can import from `src/lib`.

## Folder convention

Every concern under `src/lib/<concern>/` follows the same shape:

| File                | Purpose                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------- |
| `constants.ts`      | Module-wide constants, default config, regex literals, lookup tables                    |
| `types.ts`          | Pure TypeScript types and interfaces (non-zod)                                          |
| `schemas.ts`        | Zod schemas + their inferred types (only when zod is used)                              |
| `<concern>.ts`      | One file per concern (verb- or noun-named: `state`, `factory`, `connect`, `preview`, …) |
| `<concern>.test.ts` | Vitest tests co-located with the concern they cover                                     |
| `index.ts`          | Barrel: `export * from "./<file>";` for each sibling. External imports use the barrel.  |

**Why this shape:**

- **Predictable navigation.** Every folder answers the same questions in the same place.
- **Stable import surface.** Consumers import from `@/lib/<concern>` (the barrel), not deep paths. Internal restructuring inside a folder does not break callers.
- **Cycle-resistant.** `constants` depends on `types` and nothing else; concern files depend on `constants`/`types`/`schemas`. No concern file imports a sibling concern unless one is a leaf utility (e.g. `tools.ts` uses `edits.ts`).

## Folders

### `src/lib/agents/` — coding-agent runtime

Pure logic for the planner/executor agent loop. Has no awareness of inngest, HTTP, or where it runs.

- `constants.ts` — `AGENT_CONFIG` (token/step caps), regex for inferring verification kind, `DEFAULT_VERIFICATION_COMMAND`, `TASK_SUMMARY_RE`.
- `types.ts` — `RunState`, `EscalateDecision`, `Edit`, `EditResult`, `UsageTotals`, `PersistedTelemetry`, `TelemetryPayload`, `TelemetryStore`.
- `schemas.ts` — Zod schemas for planner and final-output IO (`PlanOutputSchema`, `FinalOutputSchema`, `VerificationRecordSchema`) + inferred types.
- `state.ts` — Run-state lifecycle: `createRunState`, `markVerification`, `hasSuccessfulVerification`, `inferVerificationKind`.
- `decisions.ts` — Pure decision helpers: `stepTextOf`, `extractTaskSummary`, `shouldEscalate`. No IO.
- `edits.ts` — Search/replace primitives used by tools: `applyEdit`, `EDIT_SCHEMA`, `truncateTo`, `exceedsLimit`.
- `telemetry.ts` — Telemetry assembly + persistence (`buildTelemetry`, `persistTelemetry`, `persistTelemetryWith`). Persistence accepts an injected `TelemetryStore` for testability.
- `tools.ts` — AI SDK `tool()` factories (`createTerminalTool`, `createReadFilesTool`, `createWriteFilesTool`, `createReplaceInFileTool`, `createApplyPatchTool`, `createRunBuild/Tests/LintTool`, `createFinalizeTool`). Each tool takes `{ getSandbox, runState }` deps so the caller controls where commands run.

### `src/lib/models/` — model registry & resolution

- `constants.ts` — `MODEL_REGISTRY` (planner + executor specs from env) and `EXECUTOR_LADDER` (ordered fallback chain).
- `types.ts` — `ModelSpec`, `ResolvedModelConfig`, `KeyResolver`, `MessageRow`.
- `factory.ts` — `createModelProvider` (OpenRouter binding), `resolveSpec`/`resolveSpecWith`, `resolvePlannerModel`.
- `messages.ts` — Conversion + history retrieval for AI SDK message format (`toModelMessages`, `getPreviousMessages`).

### `src/lib/errors/` — provider error classification

- `types.ts` — `ProviderErrorCategory`, `ClassifiedProviderError`, `ProviderErrorRule`.
- `constants.ts` — `PROVIDER_ERROR_RULES` (ordered match list; first match wins).
- `provider.ts` — `classifyProviderError(err)` for retryable/user-facing decisions on upstream provider failures.

### `src/lib/sandbox/` — E2B sandbox lifecycle

- `constants.ts` — Timeouts, ports, preview server command, process probe command.
- `types.ts` — Structural interfaces (`SandboxConnection`, `PreviewSandboxConnection`, `SandboxClient`) so consumers can stub for tests without pulling in the E2B SDK.
- `connect.ts` — `connectSandbox`, `getSandbox`. Optional injected `SandboxClient` for tests.
- `preview.ts` — `getSandboxUrl`, `probePreviewOnce`, `isPreviewProcessRunning`, `ensurePreviewReady` (poll-or-start preview server).

### `src/lib/providers/` — LLM provider catalog

- `types.ts` — `Provider` literal union.
- `constants.ts` — `PROVIDERS` array.
- `config.ts` (`server-only`) — Reads API keys from env. `getProviderKey`, `isProviderAvailable`, `getProviderAvailabilityMap`.

### `src/lib/rate-limit/` — TRPC rate limiting

- `types.ts` — `RateLimiter`, `RateLimitConfig` (the limiter is structural; tests pass a fake).
- `constants.ts` — Window/points defaults, `DEFAULT_RATE_LIMIT_CONFIG`, `GLOBAL_FALLBACK_KEY`.
- `hash.ts` — `hashKey` (sha256 of caller key, truncated).
- `factory.ts` — `createRateLimiter` (Prisma-backed) + a memoized `getDefaultLimiter`.
- `consume.ts` — `consume(limiter, rawKey)` (throws `TRPCError TOO_MANY_REQUESTS`) and `consumeRateLimit(ip)` (no-op in dev).

### `src/lib/utils/` — generic UI utilities

- `cn.ts` — `cn(...inputs)` Tailwind class merger (clsx + tailwind-merge). Re-exported from `index.ts` so shadcn-generated components keep working with `@/lib/utils`.

### Existing folders following the same convention

- `src/lib/config/` — `env.ts`, `models.ts` (model id constants).
- `src/lib/log/` — Structured logger (`createLogger`, `timed`).
- `src/lib/prompts/` — Prompt strings and provider cache options.
- `src/lib/schemas/` — Cross-cutting zod schemas (e.g. `thought`).

## Import rules

- **External callers always import from the folder barrel** (`@/lib/agents`, `@/lib/models`, etc.), not deep paths. Within a folder, sibling files import each other relatively (`./constants`, `./types`).
- **Direction of dependencies inside a concern**: `constants` and `types` are leaves. `schemas` is a leaf. Concern files depend on those, plus optionally on a sibling leaf utility (e.g. `tools.ts` → `edits.ts`).
- **`src/lib/*` MUST NOT import from `src/inngest`, `src/app`, or `src/modules`.** Reverse direction is allowed.
- **`server-only` modules** (currently `providers/config.ts`) keep that pragma at the top — re-exporting them through a barrel is fine; the bundler enforces server boundaries.

## Where to put new code

| New thing                   | Folder                                            |
| --------------------------- | ------------------------------------------------- |
| New tool the agent can call | `src/lib/agents/tools.ts`                         |
| New escalation heuristic    | `src/lib/agents/decisions.ts`                     |
| New telemetry field         | `src/lib/agents/{types,telemetry}.ts`             |
| Add a model fallback rung   | `src/lib/models/constants.ts` (`EXECUTOR_LADDER`) |
| New provider error category | `src/lib/errors/{types,constants}.ts`             |
| New sandbox capability      | `src/lib/sandbox/<concern>.ts`                    |
| New shared zod schema       | `src/lib/schemas/<name>.ts`                       |
| New rate-limit policy       | `src/lib/rate-limit/{constants,factory}.ts`       |

If a new concern doesn't fit any existing folder, create `src/lib/<concern>/` with the same shape (`constants.ts`, `types.ts`, concern files, `index.ts`). Do not add files directly under `src/lib/`.
