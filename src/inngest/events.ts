export const EVENT_NAMES = {
  codeAgentRun: "codeAgent/run",
  askAgentRun: "askAgent/run",
} as const;

export type AgentMode = "ask" | "code";

export function eventNameForMode(mode: AgentMode): string {
  if (mode === "ask") {
    return EVENT_NAMES.askAgentRun;
  }
  return EVENT_NAMES.codeAgentRun;
}
