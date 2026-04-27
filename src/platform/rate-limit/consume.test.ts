import { describe, it, expect, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { consume, hashKey } from "./consume";
import type { RateLimiter } from "./types";

describe("hashKey", () => {
  it("returns 32-char hex digest", () => {
    const h = hashKey("1.2.3.4");
    expect(h).toMatch(/^[0-9a-f]{32}$/);
  });
  it("is deterministic", () => {
    expect(hashKey("foo")).toBe(hashKey("foo"));
  });
  it("differs for different keys", () => {
    expect(hashKey("a")).not.toBe(hashKey("b"));
  });
});

describe("consume", () => {
  it("hashes the key before delegating to the limiter", async () => {
    const consumeFn = vi.fn().mockResolvedValue(undefined);
    const limiter: RateLimiter = { consume: consumeFn };
    await consume(limiter, "1.2.3.4");
    expect(consumeFn).toHaveBeenCalledWith(hashKey("1.2.3.4"), 1);
  });

  it("throws TOO_MANY_REQUESTS when the limiter rejects", async () => {
    const limiter: RateLimiter = {
      consume: vi.fn().mockRejectedValue(new Error("blocked")),
    };
    await expect(consume(limiter, "ip")).rejects.toBeInstanceOf(TRPCError);
    await expect(consume(limiter, "ip")).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("resolves when the limiter accepts", async () => {
    const limiter: RateLimiter = {
      consume: vi.fn().mockResolvedValue({ remainingPoints: 5 }),
    };
    await expect(consume(limiter, "ip")).resolves.toBeUndefined();
  });
});
