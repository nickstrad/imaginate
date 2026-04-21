import { tool } from "ai";
import { z } from "zod";
import { getSandbox } from "./utils";
import { AGENT_CONFIG, type RunState } from "./agent-config";

type Deps = {
  sandboxId: string;
  runState: RunState;
};

const TSC_VERIFY = /\btsc\b[^|]*--noEmit\b/;

function truncate(s: string) {
  const max = AGENT_CONFIG.maxStdoutChars;
  if (max === undefined) return s;
  return s.length > max ? s.slice(0, max) : s;
}

function exceedsMax(len: number) {
  const max = AGENT_CONFIG.maxStdoutChars;
  return max !== undefined && len > max;
}

export function createTerminalTool({ sandboxId, runState }: Deps) {
  let runCount = 0;
  return tool({
    description:
      "Run a shell command in the sandbox. Returns structured { success, exitCode, stdout, stderr, truncated }.",
    inputSchema: z.object({ command: z.string() }),
    execute: async ({ command }) => {
      if (
        AGENT_CONFIG.maxTerminalRuns !== undefined &&
        runCount >= AGENT_CONFIG.maxTerminalRuns
      ) {
        return { success: false, error: "Max terminal runs exceeded" };
      }
      runCount++;

      const buffers = { stdout: "", stderr: "" };
      try {
        const sandbox = await getSandbox(sandboxId);
        const result = await sandbox.commands.run(command, {
          timeoutMs: 0,
          onStdout: (d: string) => {
            buffers.stdout += d;
          },
          onStderr: (d: string) => {
            buffers.stderr += d;
          },
        });

        const success = result.exitCode === 0;
        runState.commandsRun.push({ command, success });

        if (success && TSC_VERIFY.test(command.trim())) {
          runState.buildSucceeded = true;
        }

        return {
          success,
          exitCode: result.exitCode,
          stdout: truncate(buffers.stdout),
          stderr: truncate(buffers.stderr),
          truncated:
            exceedsMax(buffers.stdout.length) ||
            exceedsMax(buffers.stderr.length),
        };
      } catch (error) {
        runState.commandsRun.push({ command, success: false });
        return {
          success: false,
          exitCode: -1,
          stdout: truncate(buffers.stdout),
          stderr: truncate(buffers.stderr),
          error: String(error),
        };
      }
    },
  });
}

export function createReadFilesTool({ sandboxId, runState }: Deps) {
  let readCount = 0;
  return tool({
    description: "Read one or more files from the sandbox.",
    inputSchema: z.object({ files: z.array(z.string()) }),
    execute: async ({ files }) => {
      if (
        AGENT_CONFIG.maxFileReads !== undefined &&
        readCount + files.length > AGENT_CONFIG.maxFileReads
      ) {
        return { success: false, error: "Max file reads exceeded" };
      }
      readCount += files.length;

      try {
        const sandbox = await getSandbox(sandboxId);
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

function writeBudgetExceeded(runState: RunState) {
  if (AGENT_CONFIG.maxWrites === undefined) return false;
  return Object.keys(runState.filesWritten).length >= AGENT_CONFIG.maxWrites;
}

export function createCreateFilesTool({ sandboxId, runState }: Deps) {
  return tool({
    description:
      "Create NEW files in the sandbox. Use replaceInFile to modify existing files. Batch all new files into a single call.",
    inputSchema: z.object({
      files: z.array(z.object({ path: z.string(), content: z.string() })),
    }),
    execute: async ({ files }) => {
      if (writeBudgetExceeded(runState)) {
        return { success: false, error: "Max writes exceeded" };
      }

      try {
        const sandbox = await getSandbox(sandboxId);
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

export function createReplaceInFileTool({ sandboxId, runState }: Deps) {
  return tool({
    description:
      "Replace the first occurrence of `find` with `replace` in the given file. Preferred over createOrUpdateFiles for small edits.",
    inputSchema: z.object({
      path: z.string(),
      find: z.string(),
      replace: z.string(),
    }),
    execute: async ({ path, find, replace }) => {
      if (writeBudgetExceeded(runState)) {
        return { success: false, error: "Max writes exceeded" };
      }

      try {
        const sandbox = await getSandbox(sandboxId);
        const content = await sandbox.files.read(path);
        if (!content.includes(find)) {
          return { success: false, error: "`find` string not found" };
        }
        const updated = content.replace(find, replace);
        await sandbox.files.write(path, updated);
        runState.filesWritten[path] = updated;
        return { success: true, path };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });
}

export function createListFilesTool({ sandboxId }: Deps) {
  return tool({
    description:
      "List files under a path (`ls -R`). Does not count against terminal budget.",
    inputSchema: z.object({ path: z.string().default(".") }),
    execute: async ({ path }) => {
      try {
        const sandbox = await getSandbox(sandboxId);
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

export function computeIsError(_runState: RunState, summary: string) {
  return !summary;
}
