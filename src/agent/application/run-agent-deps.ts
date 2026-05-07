import type {
  AgentEventSink,
  AgentLogger,
  MessageStore,
  ModelGateway,
  TelemetryStore,
  ToolFactory,
  WorkspaceProvider,
} from "../ports";

export interface AgentRuntimeDeps {
  modelGateway: ModelGateway;
  workspaceProvider: WorkspaceProvider;
  toolFactory: ToolFactory;
  messageStore: MessageStore;
  telemetryStore: TelemetryStore;
  eventSink: AgentEventSink;
  logger: AgentLogger;
}
