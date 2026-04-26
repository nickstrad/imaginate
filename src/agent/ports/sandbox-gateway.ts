// Sandbox port. Surface mirrors the subset of @e2b/code-interpreter's
// Sandbox that src/lib/agents/tools.ts and src/lib/agents/executor.ts
// actually exercise (commands.run, files.read/write, setTimeout, getHost).

export interface SandboxCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SandboxCommandOptions {
  timeoutMs?: number;
  onStdout?: (line: string) => void;
  onStderr?: (line: string) => void;
}

export interface SandboxHandle {
  readonly sandboxId: string;
  commands: {
    run(
      cmd: string,
      opts?: SandboxCommandOptions
    ): Promise<SandboxCommandResult>;
  };
  files: {
    read(path: string): Promise<string>;
    write(path: string, content: string): Promise<void>;
  };
  setTimeout(ms: number): void;
  getHost(port?: number): string;
}

export interface SandboxGateway {
  // Mirrors the existing `getSandbox: () => Promise<SandboxLike>` hook.
  acquire(): Promise<SandboxHandle>;
}
