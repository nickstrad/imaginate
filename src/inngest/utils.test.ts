import { describe, it, expect, vi } from "vitest";
import {
  connectSandbox,
  SANDBOX_DEFAULT_TIMEOUT_MS,
  type SandboxClient,
  type SandboxConnection,
} from "./utils";

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
