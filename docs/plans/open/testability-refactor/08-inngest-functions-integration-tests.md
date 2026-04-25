# `functions.ts` integration tests

Deferred from the testability refactor (Phase 9 — `functions.ts` decomposition).

Status: ⬜ not started.
Depends on: [Prisma repository layer](./01-prisma-repository-layer.md), [`SandboxOps` interface](./02-sandbox-ops-interface.md), [`withSandbox` lifecycle](./05-with-sandbox-lifecycle.md), [`persistRun` helper](./06-persist-run-helper.md).

## Goal

Add `src/inngest/functions.test.ts` (colocated per architecture doc) covering the orchestrator paths that are currently untested because they depended on real Prisma/E2B.

## Coverage targets

- success on first ladder slot
- mid-ladder failure with retry
- full-ladder exhaustion
- transient retry (classifier-driven)
- verification-required escalation

## Before

No test file. The only way to exercise `codeAgentFunction` end-to-end is to run the real Inngest dev server with a real sandbox and a live AI provider.

## After

`src/inngest/functions.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { codeAgentFunction } from "./functions";
import type { SandboxOps } from "@/lib/sandbox";
import type { ProjectRepo, MessageRepo } from "@/lib/db";
import type { TelemetryStore } from "@/lib/agents";

function makeFakeOps(overrides: Partial<SandboxOps> = {}): SandboxOps {
  return {
    exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    readFile: async () => "",
    writeFile: async () => {},
    listFiles: async () => [],
    ...overrides,
  };
}

const fakeMessages: MessageRepo = {
  create: vi.fn(async () => ({ id: "m1" })),
  updateThoughts: vi.fn(async () => {}),
  update: vi.fn(async () => {}),
};

const fakeTelemetry: TelemetryStore = { persist: vi.fn(async () => {}) };

const fakeAi = {
  generateText: vi.fn(async () => ({
    steps: [{ stepNumber: 0, finishReason: "stop", toolCalls: [], usage: {} }],
    usage: { totalTokens: 10 },
  })),
};

describe("codeAgentFunction", () => {
  it("succeeds on first ladder slot", async () => {
    const result = await codeAgentFunction.handler(
      { event: { data: { userPrompt: "hi", projectId: "p1" } } } as any,
      {
        sandbox: makeFakeOps(),
        messages: fakeMessages,
        telemetry: fakeTelemetry,
        ai: fakeAi,
      }
    );
    expect(result.escalatedTo).toBe(EXECUTOR_LADDER[0].model);
    expect(fakeMessages.update).toHaveBeenCalled();
  });

  it("escalates when verification fails", async () => {
    const ops = makeFakeOps({
      exec: async (cmd) => ({
        exitCode: cmd.includes("test") ? 1 : 0,
        stdout: "",
        stderr: "fail",
      }),
    });
    // ... assert ladder advanced and final outcome
  });

  // mid-ladder failure with retry, exhaustion, transient retry, ...
});
```

## Gain

- Orchestrator paths get fast feedback (no E2B, no Prisma, no AI provider).
- Regressions in escalation/cleanup logic surface in CI instead of production.
- Documents the expected behavior of the ladder — currently only inferable by reading the loop.
