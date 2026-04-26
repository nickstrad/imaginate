// Telemetry persistence port. Implementations live in
// `agent/adapters/prisma/telemetry-store.ts` (production) and
// `agent/adapters/memory/stores.ts` (in-memory).

import type { PersistedTelemetry, TelemetryPayload } from "../domain/types";

export interface TelemetryUpsertArgs {
  where: { messageId: string };
  create: PersistedTelemetry & { messageId: string };
  update: PersistedTelemetry;
}

export interface TelemetryStore {
  upsert(args: TelemetryUpsertArgs): Promise<unknown>;
}

export type { PersistedTelemetry, TelemetryPayload };
