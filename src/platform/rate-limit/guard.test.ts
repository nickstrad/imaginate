import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { createRateLimitGuard } from ".";
import type { RateLimiter } from ".";

function makeLimiter(impl: RateLimiter["consume"]): RateLimiter {
  return { consume: impl };
}

describe("createRateLimitGuard", () => {
  it("bypasses the limiter entirely in development mode", async () => {
    const consumeFn = vi.fn().mockResolvedValue(undefined);
    const guard = createRateLimitGuard({
      limiter: makeLimiter(consumeFn),
      isDevelopment: true,
      fallbackKey: "fallback",
    });
    await guard.consume("1.2.3.4");
    await guard.consume(null);
    expect(consumeFn).not.toHaveBeenCalled();
  });

  it("forwards a deterministic 32-hex-char hashed key when not in development", async () => {
    const consumeFn = vi.fn().mockResolvedValue(undefined);
    const guard = createRateLimitGuard({
      limiter: makeLimiter(consumeFn),
      isDevelopment: false,
      fallbackKey: "fallback",
    });
    await guard.consume("1.2.3.4");
    await guard.consume("1.2.3.4");
    expect(consumeFn).toHaveBeenCalledTimes(2);
    const [firstKey, firstPoints] = consumeFn.mock.calls[0];
    const [secondKey] = consumeFn.mock.calls[1];
    expect(firstKey).toMatch(/^[0-9a-f]{32}$/);
    expect(firstPoints).toBe(1);
    expect(secondKey).toBe(firstKey);
  });

  it("uses the configured fallback key when the IP is null", async () => {
    const consumeFn = vi.fn().mockResolvedValue(undefined);
    const guard = createRateLimitGuard({
      limiter: makeLimiter(consumeFn),
      isDevelopment: false,
      fallbackKey: "global-anon",
    });
    await guard.consume(null);
    await guard.consume("global-anon");
    expect(consumeFn).toHaveBeenCalledTimes(2);
    expect(consumeFn.mock.calls[0][0]).toBe(consumeFn.mock.calls[1][0]);
  });

  it("resolves to undefined when the limiter accepts", async () => {
    const guard = createRateLimitGuard({
      limiter: makeLimiter(vi.fn().mockResolvedValue({ remainingPoints: 5 })),
      isDevelopment: false,
      fallbackKey: "fallback",
    });
    await expect(guard.consume("ip")).resolves.toBeUndefined();
  });

  it("throws TRPCError TOO_MANY_REQUESTS when the limiter rejects", async () => {
    const guard = createRateLimitGuard({
      limiter: makeLimiter(vi.fn().mockRejectedValue(new Error("blocked"))),
      isDevelopment: false,
      fallbackKey: "fallback",
    });
    await expect(guard.consume("ip")).rejects.toBeInstanceOf(TRPCError);
    await expect(guard.consume("ip")).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });
});
