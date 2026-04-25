import { tool } from "ai";
import { z } from "zod";
import type { Sandbox } from "@e2b/code-interpreter";
import { AGENT_CONFIG, DEFAULT_VERIFICATION_COMMAND } from "./constants";
import { applyEdit, EDIT_SCHEMA, exceedsLimit, truncateTo } from "./edits";
import { FinalOutputSchema, type FinalOutput } from "./schemas";
import { inferVerificationKind, markVerification } from "./state";
import type { RunState, VerificationToolKind } from "./types";

type SandboxLike = Awaited<ReturnType<typeof Sandbox.create>>;

type Deps = {
  getSandbox: () => Promise<SandboxLike>;
  runState: RunState;
};

function truncate(s: string) {
  return truncateTo(s, AGENT_CONFIG.maxStdoutChars);
}

function exceedsMax(len: number) {
  return exceedsLimit(len, AGENT_CONFIG.maxStdoutChars);
}

async function runCommand(
  sandbox: SandboxLike,
  command: string
): Promise<{
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}> {
  const buffers = { stdout: "", stderr: "" };
  const result = await sandbox.commands.run(command, {
    timeoutMs: AGENT_CONFIG.commandTimeoutMs ?? 0,
    onStdout: (d: string) => {
      buffers.stdout += d;
    },
    onStderr: (d: string) => {
      buffers.stderr += d;
    },
  });
  return {
    success: result.exitCode === 0,
    exitCode: result.exitCode,
    stdout: truncate(buffers.stdout),
    stderr: truncate(buffers.stderr),
    stdoutTruncated: exceedsMax(buffers.stdout.length),
    stderrTruncated: exceedsMax(buffers.stderr.length),
  };
}

export function createTerminalTool({ getSandbox, runState }: Deps) {
  return tool({
    description:
      "Run a shell command in the sandbox. Returns { success, exitCode, stdout, stderr, stdoutTruncated, stderrTruncated }.",
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

export function createReadFilesTool({ getSandbox, runState }: Deps) {
  return tool({
    description: "Read one or more files from the sandbox.",
    inputSchema: z.object({ files: z.array(z.string()) }),
    execute: async ({ files }) => {
      try {
        const sandbox = await getSandbox();
        const results = await Promise.all(
          files.map(async (path) => {
            const content = await sandbox.files.read(path);
            runState.filesRead.push(path);
            return {
              path,
              content: truncate(content),
              truncated: exceedsMax(content.length),
            };
          })
        );
        return { success: true, files: results };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });
}

export function createListFilesTool({ getSandbox }: Deps) {
  return tool({
    description: "List files under a path (`ls -R`). Free — no budget cost.",
    inputSchema: z.object({ path: z.string().default(".") }),
    execute: async ({ path }) => {
      try {
        const sandbox = await getSandbox();
        const result = await sandbox.commands.run(`ls -R ${path}`);
        return {
          success: result.exitCode === 0,
          output: (result.stdout ?? "").slice(0, 10_000),
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });
}

export function createWriteFilesTool({ getSandbox, runState }: Deps) {
  return tool({
    description:
      "Create NEW files or fully rewrite files in the sandbox. Prefer replaceInFile / applyPatch for edits to existing files. Batch writes into one call.",
    inputSchema: z.object({
      files: z.array(z.object({ path: z.string(), content: z.string() })),
    }),
    execute: async ({ files }) => {
      try {
        const sandbox = await getSandbox();
        for (const f of files) {
          await sandbox.files.write(f.path, f.content);
          runState.filesWritten[f.path] = f.content;
        }
        return {
          success: true,
          filesWritten: Object.keys(runState.filesWritten),
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });
}

export function createReplaceInFileTool({ getSandbox, runState }: Deps) {
  return tool({
    description:
      "Replace occurrences of `find` with `replace` in the given file. Set `expectedOccurrences` when >1 match expected; default 1. Preferred for small edits.",
    inputSchema: z.object({ path: z.string() }).merge(EDIT_SCHEMA),
    execute: async ({ path, find, replace, expectedOccurrences }) => {
      try {
        const sandbox = await getSandbox();
        const original = await sandbox.files.read(path);
        const result = applyEdit(original, {
          find,
          replace,
          expectedOccurrences,
        });
        if (!result.ok) {
          return { success: false, error: result.error };
        }
        await sandbox.files.write(path, result.content);
        runState.filesWritten[path] = result.content;
        return { success: true, path, replacements: result.count };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });
}

export function createApplyPatchTool({ getSandbox, runState }: Deps) {
  return tool({
    description:
      "Apply multiple search/replace edits to a file in one call. Each edit is applied in order to the file's current content. Use for larger refactors.",
    inputSchema: z.object({
      path: z.string(),
      edits: z.array(EDIT_SCHEMA).min(1),
    }),
    execute: async ({ path, edits }) => {
      const cap = AGENT_CONFIG.patchBytesCap;
      if (cap !== undefined) {
        const total = edits.reduce(
          (n, e) => n + e.find.length + e.replace.length,
          0
        );
        if (total > cap) {
          return {
            success: false,
            error: `Patch payload ${total} bytes exceeds cap ${cap}. Split into smaller edits.`,
          };
        }
      }
      try {
        const sandbox = await getSandbox();
        let content = await sandbox.files.read(path);
        const applied: Array<{ count: number }> = [];
        for (const [i, edit] of edits.entries()) {
          const result = applyEdit(content, edit);
          if (!result.ok) {
            return {
              success: false,
              error: `Edit ${i}: ${result.error}`,
              appliedSoFar: applied,
            };
          }
          content = result.content;
          applied.push({ count: result.count });
        }
        await sandbox.files.write(path, content);
        runState.filesWritten[path] = content;
        return { success: true, path, edits: applied };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });
}

function verificationRunner(
  deps: Deps,
  kind: VerificationToolKind,
  description: string
) {
  return tool({
    description,
    inputSchema: z.object({
      command: z.string().optional(),
    }),
    execute: async ({ command }) => {
      const cmd = command ?? DEFAULT_VERIFICATION_COMMAND[kind];
      try {
        const sandbox = await deps.getSandbox();
        const res = await runCommand(sandbox, cmd);
        deps.runState.commandsRun.push({ command: cmd, success: res.success });
        markVerification(deps.runState, kind, cmd, res.success);
        return { ...res, kind, command: cmd };
      } catch (error) {
        deps.runState.commandsRun.push({ command: cmd, success: false });
        markVerification(deps.runState, kind, cmd, false);
        return { success: false, kind, command: cmd, error: String(error) };
      }
    },
  });
}

export function createRunBuildTool(deps: Deps) {
  return verificationRunner(
    deps,
    "build",
    "Run the TypeScript type check (tsc --noEmit). Records a verification row."
  );
}

export function createRunTestsTool(deps: Deps) {
  return verificationRunner(
    deps,
    "test",
    "Run the project's test suite. Records a verification row."
  );
}

export function createRunLintTool(deps: Deps) {
  return verificationRunner(
    deps,
    "lint",
    "Run the project's linter. Records a verification row."
  );
}

export function createFinalizeTool({ runState }: Deps) {
  return tool({
    description:
      "Call this EXACTLY ONCE when the task is complete. Pass a structured summary. This terminates the run.",
    inputSchema: FinalOutputSchema,
    execute: async (input: FinalOutput) => {
      runState.finalOutput = input;
      return { success: true, status: input.status };
    },
  });
}

export function isFinalOutputAcceptable(runState: RunState): boolean {
  return (
    runState.finalOutput !== undefined &&
    runState.finalOutput.status !== "failed"
  );
}
