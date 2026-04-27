import { MessageMode } from "@/generated/prisma";
import {
  MessageProjectNotFoundError,
  type MessageRepository,
} from "./repository";
import type { AgentMode } from "./types";

function toMessageMode(mode: AgentMode): MessageMode {
  return mode === "ask" ? MessageMode.ASK : MessageMode.CODE;
}

export async function createUserMessage(
  input: { projectId: string; userPrompt: string; mode: AgentMode },
  deps: { repository: MessageRepository }
) {
  const exists = await deps.repository.projectExists(input.projectId);
  if (!exists) {
    throw new MessageProjectNotFoundError(input.projectId);
  }

  const message = await deps.repository.createUserMessageAndTouchProject({
    projectId: input.projectId,
    userPrompt: input.userPrompt,
    mode: toMessageMode(input.mode),
  });

  return {
    message,
    agentRun: {
      kind: "agent.run" as const,
      mode: input.mode,
      projectId: input.projectId,
      userPrompt: input.userPrompt,
    },
  };
}
