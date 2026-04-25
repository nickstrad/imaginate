import { Sandbox } from "@e2b/code-interpreter";
import { createLogger } from "@/lib/log";

export const SANDBOX_DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const SANDBOX_PORT = 3000;

/** Back-compat alias. */
export const SANDBOX_TIMEOUT = SANDBOX_DEFAULT_TIMEOUT_MS;

const PREVIEW_PROBE_ATTEMPTS = 240;
const PREVIEW_PROBE_INTERVAL_MS = 250;
const PREVIEW_SERVER_COMMAND =
  "cd /home/user && npx next dev --turbopack -H 0.0.0.0";

const previewLog = createLogger({ scope: "sandbox:preview" });

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

export const getSandboxUrl = (
  sandbox: Pick<PreviewSandboxConnection, "getHost">
) => `https://${sandbox.getHost(SANDBOX_PORT)}`;

export const probePreviewOnce = async (url: string) => {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
    });
    return response.ok || (response.status >= 300 && response.status < 400);
  } catch {
    return false;
  }
};

export const isPreviewProcessRunning = async (
  sandbox: Pick<PreviewSandboxConnection, "commands">
) => {
  const result = await sandbox.commands.run(
    "pgrep -f '[n]ext dev' >/dev/null && echo running || echo missing"
  );
  return result.stdout.includes("running");
};

export const ensurePreviewReady = async (
  sandbox: PreviewSandboxConnection,
  options: {
    attempts?: number;
    intervalMs?: number;
    probe?: (url: string) => Promise<boolean>;
    sleep?: (ms: number) => Promise<void>;
  } = {}
) => {
  const sandboxId = sandbox.sandboxId;
  const url = getSandboxUrl(sandbox);
  const start = Date.now();
  const attempts = options.attempts ?? PREVIEW_PROBE_ATTEMPTS;
  const intervalMs = options.intervalMs ?? PREVIEW_PROBE_INTERVAL_MS;
  const probe = options.probe ?? probePreviewOnce;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  if (await probe(url)) {
    previewLog.debug({
      event: "preview ready",
      metadata: { sandboxId, via: "fast-path", elapsedMs: Date.now() - start },
    });
    return true;
  }

  if (!(await isPreviewProcessRunning(sandbox))) {
    previewLog.info({
      event: "starting preview server",
      metadata: { sandboxId, command: PREVIEW_SERVER_COMMAND },
    });
    await sandbox.commands.run(PREVIEW_SERVER_COMMAND, { background: true });
  }

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (await probe(url)) {
      previewLog.info({
        event: "preview ready",
        metadata: {
          sandboxId,
          attempts: attempt,
          elapsedMs: Date.now() - start,
        },
      });
      return true;
    }
    await sleep(intervalMs);
  }

  previewLog.warn({
    event: "preview not ready",
    metadata: {
      sandboxId,
      attempts,
      elapsedMs: Date.now() - start,
    },
  });
  return false;
};
