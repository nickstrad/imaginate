import { env } from "@/platform/config/env";
import type { RateLimitConfig } from "./types";

export const DURATION_SECONDS = 60 * 60;
export const DEFAULT_POINTS = 10;
export const GLOBAL_FALLBACK_KEY = "global-anonymous";

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  points: env.RATE_LIMIT_PER_HOUR ?? DEFAULT_POINTS,
  durationSeconds: DURATION_SECONDS,
  tableName: "Usage",
};
