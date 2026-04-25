import crypto from "crypto";
import { RateLimiterPrisma } from "rate-limiter-flexible";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/db";
import { env, isDevelopment } from "@/lib/config/env";

export const DURATION_SECONDS = 60 * 60;
export const DEFAULT_POINTS = 10;
export const GLOBAL_FALLBACK_KEY = "global-anonymous";

export function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 32);
}

export interface RateLimiter {
  consume(key: string, points?: number): Promise<unknown>;
}

export interface RateLimitConfig {
  points: number;
  durationSeconds: number;
  tableName: string;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  points: env.RATE_LIMIT_PER_HOUR ?? DEFAULT_POINTS,
  durationSeconds: DURATION_SECONDS,
  tableName: "Usage",
};

export function createRateLimiter(
  storeClient: typeof prisma,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG,
): RateLimiter {
  return new RateLimiterPrisma({
    storeClient,
    points: config.points,
    duration: config.durationSeconds,
    tableName: config.tableName,
  });
}

let defaultLimiter: RateLimiter | null = null;
function getDefaultLimiter(): RateLimiter {
  if (!defaultLimiter) {
    defaultLimiter = createRateLimiter(prisma);
  }
  return defaultLimiter;
}

export async function consume(
  limiter: RateLimiter,
  rawKey: string,
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

export async function consumeRateLimit(ip: string | null): Promise<void> {
  if (isDevelopment) {
    return;
  }
  await consume(getDefaultLimiter(), ip ?? GLOBAL_FALLBACK_KEY);
}
