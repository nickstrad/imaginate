# Sandbox lifecycle extraction

Deferred from the testability refactor (Phase 9 — `functions.ts` decomposition).

Status: ⬜ not started.
Depends on: [`SandboxOps` interface](./02-sandbox-ops-interface.md).

## Goal

Extract sandbox creation + readiness setup out of `codeAgentFunction` into `src/lib/sandbox/lifecycle.ts` so it's testable in isolation. Then audit error paths in `runCodingAgentWithEscalation` for state inconsistencies (the agent can fail mid-run leaving partial DB state).

## Important: sandboxes are intentionally persistent

The sandbox created during the agent run **outlives** the run — the preview URL connects to the same sandbox after the agent finishes (`functions.ts:485-487` creates it and stores the ID; `functions.ts:532` reconnects via `getSandbox(sandboxId)` to fetch the preview URL). Cleanup happens via the E2B-side timeout (`SANDBOX_DEFAULT_TIMEOUT_MS`), not via `kill()` in our code.

So this plan is **not** about adding `try/finally { sandbox.kill() }`. That would break the preview.

## Before

`src/inngest/functions.ts:480-487`:

```ts
const sandboxId = await loggedStep(step, "get-sandbox-id", async () => {
  const sandbox = await Sandbox.create("imaginate-dev");
  await sandbox.setTimeout(SANDBOX_DEFAULT_TIMEOUT_MS);
  return sandbox.sandboxId;
});
```

Inlined inside the Inngest function. Creation policy (template name, timeout) is not testable without booting Inngest.

## After

`src/lib/sandbox/lifecycle.ts`:

```ts
import { Sandbox } from "@e2b/code-interpreter";
import { SANDBOX_DEFAULT_TIMEOUT_MS } from "./constants";

export async function createAgentSandbox(): Promise<{ sandboxId: string }> {
  const sandbox = await Sandbox.create("imaginate-dev");
  await sandbox.setTimeout(SANDBOX_DEFAULT_TIMEOUT_MS);
  return { sandboxId: sandbox.sandboxId };
}
```

`src/inngest/functions.ts`:

```ts
import { createAgentSandbox } from "@/lib/sandbox";

const { sandboxId } = await loggedStep(
  step,
  "get-sandbox-id",
  createAgentSandbox
);
```

## Sub-task: error-path audit

Walk every throw path in `runCodingAgentWithEscalation` and `runExecutorOnce`. Document which paths leave inconsistent state (partial message rows, half-written telemetry) and which are safely retryable. The goal is _not_ to add cleanup — Inngest retries handle most of this — but to know what to expect in the dashboard when a step fails.

Output a short note in the plan or in `docs/architecture/architecture.md` describing the failure modes.

## Gain

- Sandbox creation policy lives in `src/lib/sandbox/`, where the rest of sandbox config lives.
- `createAgentSandbox` is unit-testable with a stubbed `Sandbox.create`.
- The error-path audit surfaces real risk (partial DB state) without inventing a non-existent leak.

## Doc updates (same PR)

- Add `lifecycle.ts` to the concern files for `src/lib/sandbox/` in `docs/architecture/architecture.md`.
