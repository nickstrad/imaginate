import { describe, it, expect, vi } from "vitest";
import { connectSandbox } from "./connect";
import { ensurePreviewReady, getSandboxUrl } from "./preview";
import { SANDBOX_DEFAULT_TIMEOUT_MS, SANDBOX_PORT } from "./constants";
import type {
  PreviewSandboxConnection,
  SandboxClient,
  SandboxConnection,
} from "./types";

function makeClient() {
  const setTimeoutFn = vi.fn().mockResolvedValue(undefined);
  const sandbox: SandboxConnection = { setTimeout: setTimeoutFn };
  const connect = vi.fn().mockResolvedValue(sandbox);
  const client: SandboxClient = { connect };
  return { client, connect, setTimeoutFn, sandbox };
}

describe("connectSandbox", () => {
  it("connects and applies the default timeout", async () => {
    const { client, connect, setTimeoutFn } = makeClient();
    await connectSandbox("sb_123", { client });
    expect(connect).toHaveBeenCalledWith("sb_123");
    expect(setTimeoutFn).toHaveBeenCalledWith(SANDBOX_DEFAULT_TIMEOUT_MS);
  });

  it("respects an injected timeout", async () => {
    const { client, setTimeoutFn } = makeClient();
    await connectSandbox("sb_123", { client, timeoutMs: 5000 });
    expect(setTimeoutFn).toHaveBeenCalledWith(5000);
  });

  it("propagates connect errors", async () => {
    const client: SandboxClient = {
      connect: vi.fn().mockRejectedValue(new Error("boom")),
    };
    await expect(connectSandbox("sb", { client })).rejects.toThrow("boom");
  });
});

function makePreviewSandbox(
  stdout = "missing"
): PreviewSandboxConnection & { run: ReturnType<typeof vi.fn> } {
  const run = vi.fn().mockResolvedValue({ stdout });
  return {
    sandboxId: "sb_preview",
    setTimeout: vi.fn(),
    getHost: vi.fn((port: number) => `preview-${port}.example.com`),
    commands: { run },
    run,
  };
}

describe("getSandboxUrl", () => {
  it("uses the configured preview port", () => {
    const sandbox = makePreviewSandbox();
    expect(getSandboxUrl(sandbox)).toBe(
      `https://preview-${SANDBOX_PORT}.example.com`
    );
  });
});

describe("ensurePreviewReady", () => {
  it("returns immediately when the preview already responds", async () => {
    const sandbox = makePreviewSandbox();
    const probe = vi.fn().mockResolvedValue(true);

    await expect(ensurePreviewReady(sandbox, { probe })).resolves.toBe(true);

    expect(probe).toHaveBeenCalledOnce();
    expect(sandbox.run).not.toHaveBeenCalled();
  });

  it("starts the preview server when missing and waits until it responds", async () => {
    const sandbox = makePreviewSandbox("missing");
    const probe = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      ensurePreviewReady(sandbox, {
        attempts: 2,
        intervalMs: 5,
        probe,
        sleep,
      })
    ).resolves.toBe(true);

    expect(sandbox.run).toHaveBeenCalledWith(
      "pgrep -f '[n]ext dev' >/dev/null && echo running || echo missing"
    );
    expect(sandbox.run).toHaveBeenCalledWith(
      "cd /home/user && npx next dev --turbopack -H 0.0.0.0 -p 3000",
      { background: true }
    );
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("uses an already-running preview server once it responds", async () => {
    const sandbox = makePreviewSandbox("running");
    const probe = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(ensurePreviewReady(sandbox, { probe, sleep })).resolves.toBe(
      true
    );

    expect(sandbox.run).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("restarts an unhealthy preview process when the port stays closed", async () => {
    const sandbox = makePreviewSandbox("running");
    const probe = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      ensurePreviewReady(sandbox, {
        attempts: 1,
        unhealthyRestartAttempts: 1,
        probe,
        sleep,
      })
    ).resolves.toBe(true);

    expect(sandbox.run).toHaveBeenCalledWith("pkill -f '[n]ext dev' || true");
    expect(sandbox.run).toHaveBeenCalledWith(
      "cd /home/user && npx next dev --turbopack -H 0.0.0.0 -p 3000",
      { background: true }
    );
  });
});
