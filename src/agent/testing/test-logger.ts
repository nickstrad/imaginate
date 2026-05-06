import type { AgentLogger, AgentLogInput } from "../ports";

export const TEST_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type TestLogLevel = (typeof TEST_LOG_LEVELS)[number];

export interface TestLogEntry {
  level: TestLogLevel;
  scope: string;
  event: string;
  bindings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface TestLogger extends AgentLogger {
  readonly entries: ReadonlyArray<TestLogEntry>;
}

export interface TestLoggerOptions {
  record?: boolean;
  scope?: string;
  bindings?: Record<string, unknown>;
}

type SharedState = {
  record: boolean;
  entries: TestLogEntry[];
};

function makeTestLogger(params: {
  state: SharedState;
  scope: string;
  bindings?: Record<string, unknown>;
}): TestLogger {
  const { state, scope, bindings } = params;
  const emit = (level: TestLogLevel, input: AgentLogInput) => {
    if (!state.record) {
      return;
    }
    state.entries.push({
      level,
      scope,
      event: input.event,
      bindings,
      metadata: input.metadata,
    });
  };
  const log = (level: TestLogLevel) => (input: AgentLogInput) => {
    emit(level, input);
  };

  return {
    get entries() {
      return state.entries;
    },
    debug: log("debug"),
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
    child: ({ scope: childScope, bindings: childBindings }) =>
      makeTestLogger({
        state,
        scope: `${scope}:${childScope}`,
        bindings: {
          ...(bindings ?? {}),
          ...(childBindings ?? {}),
        },
      }),
  };
}

export function createTestLogger(options: TestLoggerOptions = {}): TestLogger {
  return makeTestLogger({
    state: { record: options.record ?? false, entries: [] },
    scope: options.scope ?? "test",
    bindings: options.bindings,
  });
}
