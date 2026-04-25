import { Sandbox } from "@e2b/code-interpreter";

export const SANDBOX_DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/** Back-compat alias. */
export const SANDBOX_TIMEOUT = SANDBOX_DEFAULT_TIMEOUT_MS;

export interface SandboxConnection {
  setTimeout(ms: number): Promise<void> | void;
}

export interface SandboxClient<T extends SandboxConnection = SandboxConnection> {
  connect(sandboxId: string): Promise<T>;
}

const defaultClient: SandboxClient<Sandbox> = {
  connect: (id) => Sandbox.connect(id),
};

export async function connectSandbox<T extends SandboxConnection = Sandbox>(
  sandboxId: string,
  options: { client?: SandboxClient<T>; timeoutMs?: number } = {},
): Promise<T> {
  const client = (options.client ?? defaultClient) as SandboxClient<T>;
  const timeoutMs = options.timeoutMs ?? SANDBOX_DEFAULT_TIMEOUT_MS;
  const sandbox = await client.connect(sandboxId);
  await sandbox.setTimeout(timeoutMs);
  return sandbox;
}

export const getSandbox = (sandboxId: string): Promise<Sandbox> =>
  connectSandbox(sandboxId);
