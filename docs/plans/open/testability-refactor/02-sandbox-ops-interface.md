# `SandboxOps` interface

Deferred from the testability refactor (Phase 8 deeper split — agent-tools).

Status: ⬜ not started. **Ship in the same PR as [`defineTool` factory](./03-define-tool-factory.md)** — both refactor `src/lib/agents/tools.ts` end-to-end; doing them separately means rewriting tools.ts twice.

## Goal

Stop the agent tools from depending directly on the E2B `Sandbox` type. Add a narrow `SandboxOps` interface alongside the existing structural interfaces in `src/lib/sandbox/types.ts` so tests can pass an in-memory fake.

## Before

`src/lib/agents/tools.ts`:

```ts
import type { Sandbox } from "@e2b/code-interpreter";

type SandboxLike = Awaited<ReturnType<typeof Sandbox.create>>;

type Deps = {
  getSandbox: () => Promise<SandboxLike>;
  runState: RunState;
};

async function runCommand(sandbox: SandboxLike, command: string) {
  const result = await sandbox.commands.run(command, {
    timeoutMs: AGENT_CONFIG.commandTimeoutMs ?? 0,
    onStdout: (d) => { ... },
    onStderr: (d) => { ... },
  });
  // ...
}

// reads:
const content = await sandbox.files.read(path);
```

Tools need the full E2B surface to run, and tests have to mock the entire `Sandbox` object.

## After

`src/lib/sandbox/types.ts` (alongside the existing interfaces):

```ts
export interface SandboxOps {
  exec(
    command: string,
    opts?: {
      timeoutMs?: number;
      onStdout?: (d: string) => void;
      onStderr?: (d: string) => void;
    }
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;

  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  listFiles(path: string): Promise<string[]>;
}
```

`src/lib/sandbox/ops.ts`:

```ts
import type { Sandbox } from "@e2b/code-interpreter";
import type { SandboxOps } from "./types";

export function createSandboxOps(sandbox: Sandbox): SandboxOps {
  return {
    exec: (command, opts) => sandbox.commands.run(command, opts ?? {}),
    readFile: (path) => sandbox.files.read(path),
    writeFile: (path, content) => sandbox.files.write(path, content),
    listFiles: (path) =>
      sandbox.files.list(path).then((xs) => xs.map((x) => x.name)),
  };
}
```

`src/lib/agents/tools.ts`:

```ts
import type { SandboxOps } from "@/lib/sandbox";

type Deps = {
  getSandboxOps: () => Promise<SandboxOps>;
  runState: RunState;
};

// reads:
const content = await ops.readFile(path);
```

Test:

```ts
const fakeOps: SandboxOps = {
  exec: async (cmd) => ({ exitCode: 0, stdout: "ok\n", stderr: "" }),
  readFile: async (p) => fs[p] ?? "",
  writeFile: async (p, c) => {
    fs[p] = c;
  },
  listFiles: async () => Object.keys(fs),
};
```

## Gain

- Agent tool tests stop pulling in `@e2b/code-interpreter`.
- The interface documents exactly which sandbox capabilities the agent uses (currently buried in scattered field accesses).
- Easier to swap E2B for a different sandbox provider — only `ops.ts` needs to change.

## Doc updates (same PR)

- Add `SandboxOps` to the types list under `src/lib/sandbox/` in `docs/architecture/architecture.md`.
- Add an "ops.ts" entry to the concern files for `src/lib/sandbox/`.
- Add a "New sandbox op → `src/lib/sandbox/ops.ts`" row to the "Where to put new code" table.
