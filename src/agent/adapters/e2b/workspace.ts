import { getSandbox } from "@/platform/sandbox";
import type {
  Workspace,
  WorkspaceCommandOptions,
  WorkspaceCommandResult,
  WorkspaceProvider,
} from "../../ports";

export interface E2bWorkspaceProviderOptions {
  sandboxId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- e2b's @e2b/code-interpreter `Sandbox` has no exported type for the surface we wrap; we only touch the documented `commands.run`/`files.read|write` shape.
function wrap(sandbox: any): Workspace {
  return {
    commands: {
      async run(
        cmd: string,
        opts?: WorkspaceCommandOptions
      ): Promise<WorkspaceCommandResult> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- builds an options bag for the untyped e2b SDK; only includes fields when the caller set them so we don't override SDK defaults.
        const passOpts: any = {};
        if (opts?.timeoutMs !== undefined) {
          passOpts.timeoutMs = opts.timeoutMs;
        }
        if (opts?.onStdout) {
          passOpts.onStdout = opts.onStdout;
        }
        if (opts?.onStderr) {
          passOpts.onStderr = opts.onStderr;
        }
        const result = await sandbox.commands.run(cmd, passOpts);
        return {
          exitCode: result.exitCode,
          stdout: result.stdout ?? "",
          stderr: result.stderr ?? "",
        };
      },
    },
    files: {
      async read(path: string): Promise<string> {
        return sandbox.files.read(path);
      },
      async write(path: string, content: string): Promise<void> {
        await sandbox.files.write(path, content);
      },
    },
  };
}

export function createE2bWorkspaceProvider(
  options: E2bWorkspaceProviderOptions
): WorkspaceProvider {
  let cached: Promise<Workspace> | undefined;
  return {
    async acquire(): Promise<Workspace> {
      if (!cached) {
        cached = (async () => {
          const sandbox = await getSandbox(options.sandboxId);
          return wrap(sandbox);
        })();
      }
      return cached;
    },
  };
}
