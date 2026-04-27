import type { Fragment, Message } from "@/generated/prisma";
import type { Thought } from "@/lib/schemas/thought";

export type AgentMode = "ask" | "code";

export type ProjectMessage = Omit<Message, "thoughts"> & {
  fragment: Fragment | null;
  thoughts?: Thought[];
};

export type MessageAgentRunIntent = {
  kind: "agent.run";
  mode: AgentMode;
  projectId: string;
  userPrompt: string;
};
