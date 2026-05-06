import { z } from "zod";
import {
  AGENT_CONFIG,
  DEFAULT_VERIFICATION_COMMAND,
  EDIT_SCHEMA,
  FinalOutputSchema,
  PlanOutputSchema,
  applyEdit,
  exceedsLimit,
  inferVerificationKind,
  markVerification,
  truncateTo,
} from "../../domain";
import type {
  FinalOutput,
  PlanOutput,
  RunState,
  VerificationToolKind,
} from "../../domain/types";
import type {
  SandboxHandle,
  ToolDefinition,
  ToolFactory,
  ToolFactoryContext,
  ToolSet,
} from "../../ports";

function truncate(s: string) {
  return truncateTo(s, AGENT_CONFIG.maxStdoutChars);
}

function exceedsMax(len: number) {
  return exceedsLimit(len, AGENT_CONFIG.maxStdoutChars);
}

async function runCommand(
  sandbox: SandboxHandle,
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

function makeTerminalTool(
  sandbox: SandboxHandle,
  runState: RunState
): ToolDefinition {
  return {
    description:
      "Run a shell command in the sandbox. Returns { success, exitCode, stdout, stderr, stdoutTruncated, stderrTruncated }.",
    inputSchema: z.object({ command: z.string() }),
    execute: async (input) => {
      const { command } = input as { command: string };
      try {
        const res = await runCommand(sandbox, command);
        runState.commandsRun.push({ command, success: res.success });
        const kind = inferVerificationKind(command);
        if (kind) {
          markVerification(runState, kind, command, res.success);
        }
        return res;
      } catch (error) {
        // Tool failures are returned as data so the model can recover or choose another action.
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
  };
}

function makeReadFilesTool(
  sandbox: SandboxHandle,
  runState: RunState
): ToolDefinition {
  return {
    description: "Read one or more files from the sandbox.",
    inputSchema: z.object({ files: z.array(z.string()) }),
    execute: async (input) => {
      const { files } = input as { files: string[] };
      try {
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
        // Tool failures are returned as data so the model can recover or choose another action.
        return { success: false, error: String(error) };
      }
    },
  };
}

function makeListFilesTool(sandbox: SandboxHandle): ToolDefinition {
  return {
    description: "List files under a path (`ls -R`). Free — no budget cost.",
    inputSchema: z.object({ path: z.string().default(".") }),
    execute: async (input) => {
      const { path } = input as { path: string };
      try {
        const result = await sandbox.commands.run(`ls -R ${path}`);
        return {
          success: result.exitCode === 0,
          output: (result.stdout ?? "").slice(0, 10_000),
        };
      } catch (error) {
        // Tool failures are returned as data so the model can recover or choose another action.
        return { success: false, error: String(error) };
      }
    },
  };
}

function makeWriteFilesTool(
  sandbox: SandboxHandle,
  runState: RunState
): ToolDefinition {
  return {
    description:
      "Create NEW files or fully rewrite files in the sandbox. Prefer replaceInFile / applyPatch for edits to existing files. Batch writes into one call.",
    inputSchema: z.object({
      files: z.array(z.object({ path: z.string(), content: z.string() })),
    }),
    execute: async (input) => {
      const { files } = input as {
        files: Array<{ path: string; content: string }>;
      };
      try {
        for (const f of files) {
          await sandbox.files.write(f.path, f.content);
          runState.filesWritten[f.path] = f.content;
        }
        return {
          success: true,
          filesWritten: Object.keys(runState.filesWritten),
        };
      } catch (error) {
        // Tool failures are returned as data so the model can recover or choose another action.
        return { success: false, error: String(error) };
      }
    },
  };
}

function makeReplaceInFileTool(
  sandbox: SandboxHandle,
  runState: RunState
): ToolDefinition {
  return {
    description:
      "Replace occurrences of `find` with `replace` in the given file. Set `expectedOccurrences` when >1 match expected; default 1. Preferred for small edits.",
    inputSchema: z.object({ path: z.string() }).merge(EDIT_SCHEMA),
    execute: async (input) => {
      const { path, find, replace, expectedOccurrences } = input as {
        path: string;
        find: string;
        replace: string;
        expectedOccurrences: number;
      };
      try {
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
        // Tool failures are returned as data so the model can recover or choose another action.
        return { success: false, error: String(error) };
      }
    },
  };
}

function makeApplyPatchTool(
  sandbox: SandboxHandle,
  runState: RunState
): ToolDefinition {
  return {
    description:
      "Apply multiple search/replace edits to a file in one call. Each edit is applied in order to the file's current content. Use for larger refactors.",
    inputSchema: z.object({
      path: z.string(),
      edits: z.array(EDIT_SCHEMA).min(1),
    }),
    execute: async (input) => {
      const { path, edits } = input as {
        path: string;
        edits: Array<{
          find: string;
          replace: string;
          expectedOccurrences: number;
        }>;
      };
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
        // Tool failures are returned as data so the model can recover or choose another action.
        return { success: false, error: String(error) };
      }
    },
  };
}

function makeVerificationTool(
  sandbox: SandboxHandle,
  runState: RunState,
  kind: VerificationToolKind,
  description: string
): ToolDefinition {
  return {
    description,
    inputSchema: z.object({ command: z.string().optional() }),
    execute: async (input) => {
      const { command } = (input as { command?: string }) ?? {};
      const cmd = command ?? DEFAULT_VERIFICATION_COMMAND[kind];
      try {
        const res = await runCommand(sandbox, cmd);
        runState.commandsRun.push({ command: cmd, success: res.success });
        markVerification(runState, kind, cmd, res.success);
        return { ...res, kind, command: cmd };
      } catch (error) {
        // Tool failures are returned as data so the model can recover or choose another action.
        runState.commandsRun.push({ command: cmd, success: false });
        markVerification(runState, kind, cmd, false);
        return { success: false, kind, command: cmd, error: String(error) };
      }
    },
  };
}

function makeFinalizeTool(runState: RunState): ToolDefinition {
  return {
    description:
      "Call this EXACTLY ONCE when the task is complete. Pass a structured summary. This terminates the run.",
    inputSchema: FinalOutputSchema,
    execute: async (input) => {
      const output = input as FinalOutput;
      runState.finalOutput = output;
      return { success: true, status: output.status };
    },
  };
}

export function isFinalOutputAcceptable(runState: RunState): boolean {
  return (
    runState.finalOutput !== undefined &&
    runState.finalOutput.status !== "failed"
  );
}

export function createAiSdkToolFactory(): ToolFactory {
  return {
    createExecutorTools(ctx: ToolFactoryContext): ToolSet {
      const { sandbox, runState } = ctx;
      return {
        terminal: makeTerminalTool(sandbox, runState),
        listFiles: makeListFilesTool(sandbox),
        readFiles: makeReadFilesTool(sandbox, runState),
        writeFiles: makeWriteFilesTool(sandbox, runState),
        replaceInFile: makeReplaceInFileTool(sandbox, runState),
        applyPatch: makeApplyPatchTool(sandbox, runState),
        runBuild: makeVerificationTool(
          sandbox,
          runState,
          "build",
          "Run the TypeScript type check (tsc --noEmit). Records a verification row."
        ),
        runTests: makeVerificationTool(
          sandbox,
          runState,
          "test",
          "Run the project's test suite. Records a verification row."
        ),
        runLint: makeVerificationTool(
          sandbox,
          runState,
          "lint",
          "Run the project's linter. Records a verification row."
        ),
        finalize: makeFinalizeTool(runState),
      };
    },
    createPlannerSubmitTool({ onSubmit }) {
      return {
        submitPlan: {
          description: "Submit the structured plan for this run.",
          inputSchema: PlanOutputSchema,
          execute: async (input) => {
            onSubmit(input as PlanOutput);
            return { received: true };
          },
        },
      };
    },
  };
}
