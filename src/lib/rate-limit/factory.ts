import { RateLimiterPrisma } from "rate-limiter-flexible";
import { prisma } from "@/lib/db";
import { DEFAULT_RATE_LIMIT_CONFIG } from "./constants";
import type { RateLimitConfig, RateLimiter } from "./types";

export function createRateLimiter(
  storeClient: typeof prisma,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG
): RateLimiter {
  return new RateLimiterPrisma({
    storeClient,
    points: config.points,
    duration: config.durationSeconds,
    tableName: config.tableName,
  });
}
