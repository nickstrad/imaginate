import { z } from "zod/v3";
import type { AgentMode } from "@/shared/agent-mode";

export type { AgentMode };

export const EVENT_NAMES = {
  codeAgentRun: "codeAgent/run",
  askAgentRun: "askAgent/run",
  projectRename: "project/rename",
} as const;

export type AgentRunEventName =
  | typeof EVENT_NAMES.codeAgentRun
  | typeof EVENT_NAMES.askAgentRun;

export const AgentRunEventDataSchema = z.object({
  projectId: z.string().min(1),
  userPrompt: z.string().min(1),
});

export const ProjectRenameEventDataSchema = z.object({
  projectId: z.string().min(1),
  userPrompt: z.string().min(1),
});

export const INNGEST_EVENT_SCHEMAS = {
  [EVENT_NAMES.codeAgentRun]: {
    data: AgentRunEventDataSchema,
  },
  [EVENT_NAMES.askAgentRun]: {
    data: AgentRunEventDataSchema,
  },
  [EVENT_NAMES.projectRename]: {
    data: ProjectRenameEventDataSchema,
  },
} as const;

export function eventNameForMode(mode: AgentMode): AgentRunEventName {
  if (mode === "ask") {
    return EVENT_NAMES.askAgentRun;
  }
  return EVENT_NAMES.codeAgentRun;
}
