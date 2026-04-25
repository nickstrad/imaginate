import { Sandbox } from "@e2b/code-interpreter";
import { SANDBOX_DEFAULT_TIMEOUT_MS } from "./constants";
import type { SandboxClient, SandboxConnection } from "./types";

const defaultClient: SandboxClient<Sandbox> = {
  connect: (id) => Sandbox.connect(id),
};

export async function connectSandbox<T extends SandboxConnection = Sandbox>(
  sandboxId: string,
  options: { client?: SandboxClient<T>; timeoutMs?: number } = {}
): Promise<T> {
  const client = (options.client ?? defaultClient) as SandboxClient<T>;
  const timeoutMs = options.timeoutMs ?? SANDBOX_DEFAULT_TIMEOUT_MS;
  const sandbox = await client.connect(sandboxId);
  await sandbox.setTimeout(timeoutMs);
  return sandbox;
}

export const getSandbox = (sandboxId: string): Promise<Sandbox> =>
  connectSandbox(sandboxId);
