import { prisma } from "@/db";
import { RateLimiterPrisma } from "rate-limiter-flexible";

const FREE_POINTS = 2;
const DURATION = 30 * 24 * 60 * 60; // 30 days
const GENRERATION_COST = 1;

export async function getUsageTracker() {
  const usageTracker = new RateLimiterPrisma({
    storeClient: prisma,
    tableName: "Usage",
    points: FREE_POINTS,
    duration: DURATION,
  });

  return usageTracker;
}

export async function consumeCredits(userId: string) {
  if (!userId) {
    throw new Error("User not authenticated");
  }

  const usageTracker = await getUsageTracker();
  const val = await usageTracker.consume(userId, GENRERATION_COST);
  console.log("Consumed credits:", val);

  return val;
}

export async function getUsageStatus(userId: string) {
  if (!userId) {
    throw new Error("User not authenticated");
  }
  const usageTracker = await getUsageTracker();
  return await usageTracker.get(userId);
}
