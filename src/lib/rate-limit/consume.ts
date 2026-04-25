import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { isDevelopment } from "@/lib/config/env";
import { GLOBAL_FALLBACK_KEY } from "./constants";
import { createRateLimiter } from "./factory";
import { prisma } from "@/db";
import type { RateLimiter } from "./types";

export function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 32);
}

export async function consume(
  limiter: RateLimiter,
  rawKey: string
): Promise<void> {
  const key = hashKey(rawKey);
  try {
    await limiter.consume(key, 1);
  } catch {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please try again later.",
    });
  }
}

let defaultLimiter: RateLimiter | null = null;
function getDefaultLimiter(): RateLimiter {
  if (!defaultLimiter) {
    defaultLimiter = createRateLimiter(prisma);
  }
  return defaultLimiter;
}

export async function consumeRateLimit(ip: string | null): Promise<void> {
  if (isDevelopment) {
    return;
  }
  await consume(getDefaultLimiter(), ip ?? GLOBAL_FALLBACK_KEY);
}
