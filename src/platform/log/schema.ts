import { z } from "zod";

export const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);
export type LogLevel = z.infer<typeof LogLevelSchema>;

const JsonPrimitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [k: string]: JsonValue }
  | JsonValue[];
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    JsonPrimitive,
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ])
);

export const LogMetadataSchema = z.record(z.string(), JsonValueSchema);
export type LogMetadata = z.infer<typeof LogMetadataSchema>;

export const LogEntrySchema = z.object({
  timestamp: z.iso.datetime(),
  level: LogLevelSchema,
  scope: z.string().min(1),
  event: z.string().min(1),
  metadata: LogMetadataSchema.optional(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

// `metadata` is intentionally `unknown`-valued at the boundary; the logger
// normalizes before validation so callers don't pre-shape values.
export interface LogInput {
  event: string;
  metadata?: Record<string, unknown>;
}
