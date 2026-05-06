import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { RateLimiterPrisma } from "rate-limiter-flexible";
import { env, isDevelopment } from "@/platform/config/env";
import { prisma } from "@/platform/db";

export interface RateLimiter {
  consume(key: string, points?: number): Promise<unknown>;
}

export interface RateLimitConfig {
  points: number;
  durationSeconds: number;
  tableName: string;
}

export interface RateLimitGuard {
  consume(ip: string | null): Promise<void>;
}

interface CreateRateLimitGuardDeps {
  limiter: RateLimiter;
  isDevelopment: boolean;
  fallbackKey: string;
}

const DURATION_SECONDS = 60 * 60;
const DEFAULT_POINTS = 10;
const GLOBAL_FALLBACK_KEY = "global-anonymous";

const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  points: env.RATE_LIMIT_PER_HOUR ?? DEFAULT_POINTS,
  durationSeconds: DURATION_SECONDS,
  tableName: "Usage",
};

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 32);
}

export function createRateLimitGuard(
  deps: CreateRateLimitGuardDeps
): RateLimitGuard {
  return {
    async consume(ip: string | null): Promise<void> {
      if (deps.isDevelopment) {
        return;
      }
      const rawKey = ip ?? deps.fallbackKey;
      try {
        await deps.limiter.consume(hashKey(rawKey), 1);
      } catch {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many requests. Please try again later.",
        });
      }
    },
  };
}

let defaultGuard: RateLimitGuard | null = null;
function getDefaultGuard(): RateLimitGuard {
  if (!defaultGuard) {
    const limiter = new RateLimiterPrisma({
      storeClient: prisma,
      points: DEFAULT_RATE_LIMIT_CONFIG.points,
      duration: DEFAULT_RATE_LIMIT_CONFIG.durationSeconds,
      tableName: DEFAULT_RATE_LIMIT_CONFIG.tableName,
    });
    defaultGuard = createRateLimitGuard({
      limiter,
      isDevelopment,
      fallbackKey: GLOBAL_FALLBACK_KEY,
    });
  }
  return defaultGuard;
}

export async function consumeRateLimit(ip: string | null): Promise<void> {
  await getDefaultGuard().consume(ip);
}
