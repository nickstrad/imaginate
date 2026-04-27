export const PROJECT_LIMIT = 50;

export type AgentMode = "ask" | "code";

export type AgentRunIntent = {
  kind: "agent.run";
  mode: AgentMode;
  projectId: string;
  userPrompt: string;
};

export type ProjectRenameIntent = {
  kind: "project.rename";
  projectId: string;
  userPrompt: string;
};
