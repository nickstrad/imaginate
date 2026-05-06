// Structural subset of the Logger interface in src/lib/log so adapters can
// satisfy this port without depending on the concrete logger module. The
// platform/log adapter (chunk 03) will export the existing Logger as
// satisfying AgentLogger.

export interface AgentLogInput {
  event: string;
  metadata?: Record<string, unknown>;
  fileMetadata?: Record<string, unknown>;
}

export interface AgentLogger {
  debug(input: AgentLogInput): void;
  info(input: AgentLogInput): void;
  warn(input: AgentLogInput): void;
  error(input: AgentLogInput): void;
  child(params: {
    scope: string;
    bindings?: Record<string, unknown>;
  }): AgentLogger;
}
