import "server-only";
import {
  LogEntrySchema,
  type LogEntry,
  type LogInput,
  type LogLevel,
  type LogMetadata,
} from "./schema";
import { normalizeMetadata } from "./normalize";
import { getRunFileSinkWriter } from "./file-sink";
import { env, isProduction } from "@/platform/config/env";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const THRESHOLD = LEVEL_RANK[env.LOG_LEVEL];

const PRETTY =
  env.LOG_PRETTY === "true"
    ? true
    : env.LOG_PRETTY === "false"
      ? false
      : !isProduction;

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  gray: "\x1b[90m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
} as const;

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: ANSI.gray,
  info: ANSI.cyan,
  warn: ANSI.yellow,
  error: ANSI.red,
};

function formatPretty(entry: LogEntry): string {
  const levelTag = `${LEVEL_COLOR[entry.level]}${entry.level.toUpperCase().padEnd(5)}${ANSI.reset}`;
  const time = `${ANSI.dim}${entry.timestamp.slice(11, 23)}${ANSI.reset}`;
  const scope = `${ANSI.magenta}${entry.scope}${ANSI.reset}`;
  const event = `${ANSI.bold}${entry.event}${ANSI.reset}`;
  const header = `${time} ${levelTag} ${scope} ${event}`;
  if (!entry.metadata || Object.keys(entry.metadata).length === 0)
    return header;
  const meta = JSON.stringify(entry.metadata, null, 2)
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n");
  return `${header}\n${ANSI.dim}${meta}${ANSI.reset}`;
}

function formatCompact(entry: LogEntry): string {
  const metaStr = entry.metadata ? " " + JSON.stringify(entry.metadata) : "";
  return `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.scope} ${entry.event}${metaStr}`;
}

function writeLine(entry: LogEntry) {
  const line = PRETTY ? formatPretty(entry) : formatCompact(entry);
  if (entry.level === "error") console.error(line);
  else if (entry.level === "warn") console.warn(line);
  else console.log(line);
}

// In prod the typed Logger API guarantees shape; zod validation only runs in
// dev/test to catch mistakes during development.
const VALIDATE = !isProduction;

function emit(params: {
  level: LogLevel;
  scope: string;
  event: string;
  metadata?: Record<string, unknown>;
  bindings?: LogMetadata;
}) {
  const passesThreshold = LEVEL_RANK[params.level] >= THRESHOLD;
  const runId = params.bindings?.runId;
  const fileWriter =
    typeof runId === "string" ? getRunFileSinkWriter(runId) : undefined;
  if (!passesThreshold && !fileWriter) {
    return;
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: params.level,
    scope: params.scope,
    event: params.event,
    metadata: mergeMetadata(params.bindings, params.metadata),
  };

  if (VALIDATE) {
    const parsed = LogEntrySchema.safeParse(entry);
    if (!parsed.success) {
      writeLine({
        timestamp: new Date().toISOString(),
        level: "error",
        scope: "logger",
        event: "invalid-log-entry",
        metadata: {
          originalScope: params.scope,
          originalEvent: params.event,
          issues: parsed.error.issues.map((i) => ({
            path: i.path.map(String).join("."),
            code: i.code,
            message: i.message,
          })),
        },
      });
      return;
    }
  }

  if (fileWriter) {
    fileWriter(entry);
  }
  if (passesThreshold) {
    writeLine(entry);
  }
}

function mergeMetadata(
  bindings: LogMetadata | undefined,
  extra: Record<string, unknown> | undefined
): LogMetadata | undefined {
  const normalizedExtra = normalizeMetadata(extra);
  if (!bindings && !normalizedExtra) return undefined;
  return { ...(bindings ?? {}), ...(normalizedExtra ?? {}) };
}

export interface Logger {
  debug(input: LogInput): void;
  info(input: LogInput): void;
  warn(input: LogInput): void;
  error(input: LogInput): void;
  child(params: { scope: string; bindings?: Record<string, unknown> }): Logger;
}

export function createLogger(params: {
  scope: string;
  bindings?: Record<string, unknown>;
}): Logger {
  const scope = params.scope;
  const bindings = normalizeMetadata(params.bindings);
  const make = (level: LogLevel) => (input: LogInput) =>
    emit({
      level,
      scope,
      event: input.event,
      metadata: input.metadata,
      bindings,
    });
  return {
    debug: make("debug"),
    info: make("info"),
    warn: make("warn"),
    error: make("error"),
    child: ({ scope: extraScope, bindings: extra }) =>
      createLogger({
        scope: `${scope}:${extraScope}`,
        bindings: { ...(bindings ?? {}), ...(normalizeMetadata(extra) ?? {}) },
      }),
  };
}

export async function timed<T>(params: {
  logger: Logger;
  event: string;
  metadata?: Record<string, unknown>;
  fn: () => Promise<T>;
}): Promise<T> {
  const { logger, event, metadata, fn } = params;
  const start = Date.now();
  logger.debug({ event: `${event} start`, metadata });
  try {
    const result = await fn();
    const okMeta: Record<string, unknown> = {
      ...(metadata ?? {}),
      ms: Date.now() - start,
    };
    logger.info({ event: `${event} ok`, metadata: okMeta });
    return result;
  } catch (err) {
    const failMeta: Record<string, unknown> = {
      ...(metadata ?? {}),
      ms: Date.now() - start,
      err,
    };
    logger.error({ event: `${event} failed`, metadata: failMeta });
    throw err;
  }
}

export type { LogLevel, LogEntry, LogInput, LogMetadata } from "./schema";
export { openRunFileSink, type RunFileSink } from "./file-sink";
