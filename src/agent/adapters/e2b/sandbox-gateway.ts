import { ensurePreviewReady, getSandbox } from "@/platform/sandbox";
import type {
  SandboxCommandOptions,
  SandboxCommandResult,
  SandboxGateway,
  SandboxHandle,
} from "../../ports";

export interface E2bSandboxGatewayOptions {
  sandboxId: string;
  ensurePreview?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrap(sandbox: any): SandboxHandle {
  return {
    sandboxId: sandbox.sandboxId,
    commands: {
      async run(
        cmd: string,
        opts?: SandboxCommandOptions
      ): Promise<SandboxCommandResult> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    setTimeout(ms: number) {
      void sandbox.setTimeout(ms);
    },
    getHost(port?: number) {
      return sandbox.getHost(port);
    },
  };
}

export function createE2bSandboxGateway(
  options: E2bSandboxGatewayOptions
): SandboxGateway {
  let cached: Promise<SandboxHandle> | undefined;
  return {
    async acquire(): Promise<SandboxHandle> {
      if (!cached) {
        cached = (async () => {
          const sandbox = await getSandbox(options.sandboxId);
          if (options.ensurePreview) {
            await ensurePreviewReady(sandbox);
          }
          return wrap(sandbox);
        })();
      }
      return cached;
    },
  };
}
