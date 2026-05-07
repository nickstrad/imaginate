// Local workspace adapter. Wires the agent's `Workspace` port to
// `node:fs/promises` and `node:child_process` against a configurable root
// directory. Selected by `npm run agent:local -- --local <dir>` and the
// future agentic-coding TUI: there is no sandboxing, no preview URL — the
// agent just iterates and edits files in place until it is done.

import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type {
  Workspace,
  WorkspaceCommandOptions,
  WorkspaceCommandResult,
  WorkspaceProvider,
} from "../../ports";

export interface LocalWorkspaceOptions {
  root: string;
}

function resolvePath(root: string, p: string): string {
  if (path.isAbsolute(p)) {
    return p;
  }
  return path.resolve(root, p);
}

async function runProcess(
  root: string,
  command: string,
  opts?: WorkspaceCommandOptions
): Promise<WorkspaceCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: root,
      shell: true,
    });
    let stdout = "";
    let stderr = "";
    let timer: NodeJS.Timeout | undefined;
    if (opts?.timeoutMs && opts.timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
      }, opts.timeoutMs);
    }
    child.stdout.on("data", (chunk: Buffer) => {
      const s = chunk.toString();
      stdout += s;
      opts?.onStdout?.(s);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const s = chunk.toString();
      stderr += s;
      opts?.onStderr?.(s);
    });
    child.on("close", (code) => {
      if (timer) {
        clearTimeout(timer);
      }
      resolve({ exitCode: code ?? 0, stdout, stderr });
    });
    child.on("error", (err) => {
      if (timer) {
        clearTimeout(timer);
      }
      resolve({ exitCode: 1, stdout, stderr: stderr + String(err) });
    });
  });
}

export function createLocalWorkspaceProvider(
  options: LocalWorkspaceOptions
): WorkspaceProvider {
  const root = options.root;
  const workspace: Workspace = {
    commands: {
      async run(cmd, opts) {
        return runProcess(root, cmd, opts);
      },
    },
    files: {
      async read(p) {
        return fs.readFile(resolvePath(root, p), "utf8");
      },
      async write(p, content) {
        const full = resolvePath(root, p);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, content, "utf8");
      },
    },
  };
  return {
    async acquire() {
      return workspace;
    },
  };
}
