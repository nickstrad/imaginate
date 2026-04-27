import type { MessageRepository } from "./repository";
import type { Thought } from "@/shared/schemas/thought";

export async function createPendingCodeAssistantMessage(
  input: { projectId: string },
  deps: { repository: MessageRepository }
) {
  return deps.repository.createPendingCodeAssistantMessage(input.projectId);
}

export async function saveAnswerOnlyAssistantMessage(
  input: { messageId: string; answer: string },
  deps: { repository: MessageRepository }
) {
  await deps.repository.saveAnswerOnly(input);
}

export async function saveProviderErrorAssistantMessage(
  input: { messageId: string; message: string },
  deps: { repository: MessageRepository }
) {
  await deps.repository.saveProviderError(input);
}

export async function completeCodeAssistantMessage(
  input: {
    messageId: string;
    summary: string;
    title: string;
    sandboxUrl: string;
    files: Record<string, string>;
  },
  deps: { repository: MessageRepository }
) {
  await deps.repository.completeCodeMessage(input);
}

export async function failCodeAssistantMessage(
  input: { messageId: string; summary: string },
  deps: { repository: MessageRepository }
) {
  await deps.repository.failCodeMessage(input);
}

export async function createAskAssistantMessage(
  input: {
    projectId: string;
    content: string;
    type: "ERROR" | "RESULT";
  },
  deps: { repository: MessageRepository }
) {
  return deps.repository.createAskAssistantMessage(input);
}

export async function recordAssistantThoughts(
  input: { messageId: string; thoughts: Thought[] },
  deps: { repository: MessageRepository }
) {
  await deps.repository.updateThoughts(input);
}
