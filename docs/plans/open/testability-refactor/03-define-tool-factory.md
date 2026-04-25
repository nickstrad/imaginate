# `defineTool` factory

Deferred from the testability refactor (Phase 8 deeper split — agent-tools).

Status: ⬜ not started. **Ship in the same PR as [`SandboxOps` interface](./02-sandbox-ops-interface.md)** — both refactor `src/lib/agents/tools.ts` end-to-end; doing them separately means rewriting tools.ts twice.

## Goal

Centralize the boilerplate (try/catch, error serialization, `runState` mutation) shared by every tool in `src/lib/agents/tools.ts`. Each tool definition shrinks to the parts that are actually unique.

## Before

`src/lib/agents/tools.ts` repeats the same pattern in ~10 tools:

```ts
export function createTerminalTool({ getSandbox, runState }: Deps) {
  return tool({
    description: "Run a shell command in the sandbox. ...",
    inputSchema: z.object({ command: z.string() }),
    execute: async ({ command }) => {
      try {
        const sandbox = await getSandbox();
        const res = await runCommand(sandbox, command);
        runState.commandsRun.push({ command, success: res.success });
        const kind = inferVerificationKind(command);
        if (kind) {
          markVerification(runState, kind, command, res.success);
        }
        return res;
      } catch (error) {
        runState.commandsRun.push({ command, success: false });
        return {
          success: false,
          exitCode: -1,
          stdout: "",
          stderr: "",
          stdoutTruncated: false,
          stderrTruncated: false,
          error: String(error),
        };
      }
    },
  });
}
```

Every tool repeats: get sandbox, try/catch, serialize error, mutate `runState`.

## After

`src/lib/agents/define-tool.ts`:

```ts
import { tool } from "ai";
import type { z } from "zod";
import type { RunState } from "./types";

export function defineTool<I extends z.ZodTypeAny, R>(opts: {
  name: string;
  description: string;
  schema: I;
  run: (input: z.infer<I>, ctx: { sandbox: SandboxOps }) => Promise<R>;
  mutate?: (state: RunState, input: z.infer<I>, result: R) => void;
  onError?: (state: RunState, input: z.infer<I>, error: unknown) => R;
}) {
  return ({ getSandboxOps, runState }: Deps) =>
    tool({
      description: opts.description,
      inputSchema: opts.schema,
      execute: async (input) => {
        try {
          const sandbox = await getSandboxOps();
          const result = await opts.run(input, { sandbox });
          opts.mutate?.(runState, input, result);
          return result;
        } catch (error) {
          if (opts.onError) {
            return opts.onError(runState, input, error);
          }
          throw error;
        }
      },
    });
}
```

`tools.ts` shrinks:

```ts
export const createTerminalTool = defineTool({
  name: "terminal",
  description: "Run a shell command in the sandbox. ...",
  schema: z.object({ command: z.string() }),
  run: ({ command }, { sandbox }) => runCommand(sandbox, command),
  mutate: (state, { command }, res) => {
    state.commandsRun.push({ command, success: res.success });
    const kind = inferVerificationKind(command);
    if (kind) {
      markVerification(state, kind, command, res.success);
    }
  },
  onError: (state, { command }, error) => {
    state.commandsRun.push({ command, success: false });
    return {
      success: false,
      exitCode: -1,
      stdout: "",
      stderr: "",
      stdoutTruncated: false,
      stderrTruncated: false,
      error: String(error),
    };
  },
});
```

## Gain

- ~10 tool definitions drop from ~25 lines to ~10 each.
- Single chokepoint for error-handling policy (e.g. add structured logging in one place).
- Reads top-down: schema → behavior → state mutation, with no try/catch noise.

## Doc updates (same PR)

- Note `define-tool.ts` under `src/lib/agents/` in `docs/architecture/architecture.md`.
- Update the "New tool" row in the "Where to put new code" table to mention `defineTool`.
