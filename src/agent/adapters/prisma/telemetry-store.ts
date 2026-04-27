import { prisma } from "@/platform/db";
import type { TelemetryStore, TelemetryUpsertArgs } from "../../ports";

export function createPrismaTelemetryStore(): TelemetryStore {
  return {
    async upsert(args: TelemetryUpsertArgs) {
      return prisma.telemetry.upsert(args);
    },
  };
}
