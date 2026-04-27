import { createLogger } from "@/platform/log";
import {
  PREVIEW_PROBE_ATTEMPTS,
  PREVIEW_PROBE_INTERVAL_MS,
  PREVIEW_PROCESS_CHECK_COMMAND,
  PREVIEW_PROCESS_STOP_COMMAND,
  PREVIEW_SERVER_COMMAND,
  PREVIEW_UNHEALTHY_RESTART_ATTEMPTS,
  SANDBOX_PORT,
} from "./constants";
import type { PreviewSandboxConnection } from "./types";

const previewLog = createLogger({ scope: "sandbox:preview" });

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
  const result = await sandbox.commands.run(PREVIEW_PROCESS_CHECK_COMMAND);
  return result.stdout.includes("running");
};

async function startPreviewServer(
  sandbox: Pick<PreviewSandboxConnection, "commands">,
  sandboxId: string
) {
  previewLog.info({
    event: "starting preview server",
    metadata: { sandboxId, command: PREVIEW_SERVER_COMMAND },
  });
  await sandbox.commands.run(PREVIEW_SERVER_COMMAND, { background: true });
}

export const ensurePreviewReady = async (
  sandbox: PreviewSandboxConnection,
  options: {
    attempts?: number;
    intervalMs?: number;
    unhealthyRestartAttempts?: number;
    probe?: (url: string) => Promise<boolean>;
    sleep?: (ms: number) => Promise<void>;
  } = {}
) => {
  const sandboxId = sandbox.sandboxId;
  const url = getSandboxUrl(sandbox);
  const start = Date.now();
  const attempts = options.attempts ?? PREVIEW_PROBE_ATTEMPTS;
  const intervalMs = options.intervalMs ?? PREVIEW_PROBE_INTERVAL_MS;
  const unhealthyRestartAttempts =
    options.unhealthyRestartAttempts ?? PREVIEW_UNHEALTHY_RESTART_ATTEMPTS;
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

  if (await isPreviewProcessRunning(sandbox)) {
    for (let attempt = 1; attempt <= unhealthyRestartAttempts; attempt++) {
      await sleep(intervalMs);
      if (await probe(url)) {
        previewLog.info({
          event: "preview ready",
          metadata: {
            sandboxId,
            via: "existing-process",
            attempts: attempt,
            elapsedMs: Date.now() - start,
          },
        });
        return true;
      }
    }

    previewLog.warn({
      event: "restarting unhealthy preview server",
      metadata: {
        sandboxId,
        command: PREVIEW_PROCESS_STOP_COMMAND,
        attempts: unhealthyRestartAttempts,
      },
    });
    await sandbox.commands.run(PREVIEW_PROCESS_STOP_COMMAND);
  }
  await startPreviewServer(sandbox, sandboxId);

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
