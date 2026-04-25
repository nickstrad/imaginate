import { Sandbox } from "@e2b/code-interpreter";
import { createLogger } from "@/lib/log";

export const SANDBOX_TIMEOUT = 30 * 60 * 1000; // 30 minutes
export const SANDBOX_PORT = 3000;

const PREVIEW_PROBE_ATTEMPTS = 240;
const PREVIEW_PROBE_INTERVAL_MS = 250;
const PREVIEW_SERVER_COMMAND =
  "cd /home/user && npx next dev --turbopack -H 0.0.0.0";

const previewLog = createLogger({ scope: "sandbox:preview" });

export const getSandbox = async (sandboxId: string) => {
  const sandbox = await Sandbox.connect(sandboxId);
  await sandbox.setTimeout(SANDBOX_TIMEOUT);
  return sandbox;
};

export const getSandboxUrl = (sandbox: Sandbox) =>
  `https://${sandbox.getHost(SANDBOX_PORT)}`;

const probePreviewOnce = async (url: string) => {
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

const isPreviewProcessRunning = async (sandbox: Sandbox) => {
  const result = await sandbox.commands.run(
    "pgrep -f '[n]ext dev' >/dev/null && echo running || echo missing"
  );
  return result.stdout.includes("running");
};

export const ensurePreviewReady = async (sandbox: Sandbox) => {
  const sandboxId = sandbox.sandboxId;
  const url = getSandboxUrl(sandbox);
  const start = Date.now();

  if (await probePreviewOnce(url)) {
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

  for (let attempt = 1; attempt <= PREVIEW_PROBE_ATTEMPTS; attempt++) {
    if (await probePreviewOnce(url)) {
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
    await new Promise((resolve) =>
      setTimeout(resolve, PREVIEW_PROBE_INTERVAL_MS)
    );
  }

  previewLog.warn({
    event: "preview not ready",
    metadata: {
      sandboxId,
      attempts: PREVIEW_PROBE_ATTEMPTS,
      elapsedMs: Date.now() - start,
    },
  });
  return false;
};
