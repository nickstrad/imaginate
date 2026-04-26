// Telemetry persistence port. Mirrors the existing TelemetryStore in
// src/lib/agents/types.ts so chunk 03 can re-point imports without touching
// call sites in planner/executor/telemetry.ts.

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
