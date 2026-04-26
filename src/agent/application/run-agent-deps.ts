import type {
  AgentEventSink,
  AgentLogger,
  MessageStore,
  ModelGateway,
  SandboxGateway,
  TelemetryStore,
  ToolFactory,
} from "../ports";

export interface AgentRuntimeDeps {
  modelGateway: ModelGateway;
  sandboxGateway: SandboxGateway;
  toolFactory: ToolFactory;
  messageStore: MessageStore;
  telemetryStore: TelemetryStore;
  eventSink: AgentEventSink;
  logger: AgentLogger;
}
