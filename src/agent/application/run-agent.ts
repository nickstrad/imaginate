import type {
  AgentEventSink,
  AgentLogger,
  MessageStore,
  ModelGateway,
  SandboxGateway,
  TelemetryStore,
} from "../ports";
import type { AgentRunInput, AgentRunResult } from "../domain/types";

export interface AgentRuntimeDeps {
  modelGateway: ModelGateway;
  sandboxGateway: SandboxGateway;
  messageStore: MessageStore;
  telemetryStore: TelemetryStore;
  eventSink: AgentEventSink;
  logger: AgentLogger;
}

export interface RunAgentArgs {
  input: AgentRunInput;
  deps: AgentRuntimeDeps;
}

export async function runAgent(_args: RunAgentArgs): Promise<AgentRunResult> {
  throw new Error("runAgent: not implemented (chunk 03)");
}
