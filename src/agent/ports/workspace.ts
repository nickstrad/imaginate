// Capabilities only some runtimes can offer (preview URL, idle timeout,
// teardown) deliberately do NOT live on this port: the e2b composition path
// already handles preview/timeout via `src/platform/sandbox/`, and the local
// TUI has no notion of a preview URL. Reintroduce as optional capability
// sub-interfaces (e.g. `preview?: { getUrl(port): Promise<string> }`) the day
// a tool genuinely needs one — not before.

export interface WorkspaceCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface WorkspaceCommandOptions {
  timeoutMs?: number;
  onStdout?: (line: string) => void;
  onStderr?: (line: string) => void;
}

export interface Workspace {
  commands: {
    run(
      cmd: string,
      opts?: WorkspaceCommandOptions
    ): Promise<WorkspaceCommandResult>;
  };
  files: {
    read(path: string): Promise<string>;
    write(path: string, content: string): Promise<void>;
  };
}

export interface WorkspaceProvider {
  acquire(): Promise<Workspace>;
}
