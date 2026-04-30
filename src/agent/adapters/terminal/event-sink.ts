import { AgentRuntimeEventType } from "../../domain/events";
import type { AgentRuntimeEvent } from "../../domain/events";
import type { AgentEventSink } from "../../ports";

export interface TerminalEventSinkOptions {
  json?: boolean;
  write?: (line: string) => void;
}

function formatEvent(event: AgentRuntimeEvent): string {
  switch (event.type) {
    case AgentRuntimeEventType.PlannerStarted:
      return event.type;
    case AgentRuntimeEventType.PlannerFinished:
      return `${event.type} taskType=${event.plan.taskType} requiresCoding=${event.plan.requiresCoding}`;
    case AgentRuntimeEventType.PlannerFailed:
      return `${event.type} error=${event.error}`;
    case AgentRuntimeEventType.ExecutorAttemptStarted:
      return `${event.type} attempt=${event.attempt} model=${event.model}`;
    case AgentRuntimeEventType.ExecutorStepFinished:
      return `${event.type} step=${event.step.stepIndex} finishReason=${event.step.finishReason ?? "-"}`;
    case AgentRuntimeEventType.ExecutorAttemptFailed:
      return `${event.type} attempt=${event.attempt} category=${event.error.category} retryable=${event.error.retryable} error=${event.error.message}`;
    case AgentRuntimeEventType.ExecutorEscalated:
      return `${event.type} attempt=${event.attempt} reason=${event.reason ?? "-"}`;
    case AgentRuntimeEventType.ExecutorAccepted:
      return `${event.type} attempt=${event.attempt}`;
    case AgentRuntimeEventType.AgentFinished:
      return `${event.type} status=${event.finalOutput?.status ?? "missing"} steps=${event.stepsCount} totalTokens=${event.usage.totalTokens} error=${event.error?.message ?? "-"}`;
  }
}

export function createTerminalEventSink(
  options: TerminalEventSinkOptions = {}
): AgentEventSink {
  const write = options.write ?? ((line: string) => console.log(line));
  return {
    emit(event: AgentRuntimeEvent) {
      if (options.json) {
        write(JSON.stringify({ type: "event", event }));
        return;
      }
      write(formatEvent(event));
    },
  };
}
