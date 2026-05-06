export type AgentMode = "ask" | "code";

export type AgentRunIntent = {
  kind: "agent.run";
  mode: AgentMode;
  projectId: string;
  userPrompt: string;
};
