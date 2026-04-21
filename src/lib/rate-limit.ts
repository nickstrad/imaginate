import crypto from "crypto";
import { RateLimiterPrisma } from "rate-limiter-flexible";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/db";
import { env, isDevelopment } from "@/lib/config/env";

const DURATION_SECONDS = 60 * 60;
const DEFAULT_POINTS = 10;
const GLOBAL_FALLBACK_KEY = "global-anonymous";

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 32);
}

let limiter: RateLimiterPrisma | null = null;
function getLimiter(): RateLimiterPrisma {
  if (!limiter) {
    limiter = new RateLimiterPrisma({
      storeClient: prisma,
      points: env.RATE_LIMIT_PER_HOUR ?? DEFAULT_POINTS,
      duration: DURATION_SECONDS,
      tableName: "Usage",
    });
  }
  return limiter;
}

export async function consumeRateLimit(ip: string | null): Promise<void> {
  if (isDevelopment) {
    return;
  }
  const key = hashKey(ip ?? GLOBAL_FALLBACK_KEY);
  try {
    await getLimiter().consume(key, 1);
  } catch {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please try again later.",
    });
  }
}
