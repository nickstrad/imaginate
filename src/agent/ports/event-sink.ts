import type { AgentRuntimeEvent } from "../domain/events";

export interface AgentEventSink {
  emit(event: AgentRuntimeEvent): void | Promise<void>;
}
