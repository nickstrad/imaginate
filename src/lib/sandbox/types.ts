export interface SandboxConnection {
  setTimeout(ms: number): Promise<void> | void;
}

export interface PreviewSandboxConnection extends SandboxConnection {
  sandboxId: string;
  getHost(port: number): string;
  commands: {
    run(
      command: string,
      options?: { background?: boolean }
    ): Promise<{ stdout: string }>;
  };
}

export interface SandboxClient<
  T extends SandboxConnection = SandboxConnection,
> {
  connect(sandboxId: string): Promise<T>;
}
