import type { Message, MessageMode } from "@/generated/prisma";
import type { Thought } from "@/shared/schemas/thought";
import type { ProjectMessage } from "./types";

export class MessageProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Project with ID ${projectId} not found.`);
    this.name = "MessageProjectNotFoundError";
  }
}

export type CreateUserMessageInput = {
  projectId: string;
  userPrompt: string;
  mode: MessageMode;
};

export type CompleteCodeMessageInput = {
  messageId: string;
  summary: string;
  title: string;
  sandboxUrl: string;
  files: Record<string, string>;
};

export type CreateAskAssistantMessageInput = {
  projectId: string;
  content: string;
  type: "ERROR" | "RESULT";
};

export interface MessageRepository {
  projectExists(projectId: string): Promise<boolean>;
  listByProjectId(projectId: string): Promise<ProjectMessage[]>;
  createUserMessageAndTouchProject(
    input: CreateUserMessageInput
  ): Promise<Message>;
  createPendingCodeAssistantMessage(projectId: string): Promise<Message>;
  saveAnswerOnly(input: { messageId: string; answer: string }): Promise<void>;
  saveProviderError(input: {
    messageId: string;
    message: string;
  }): Promise<void>;
  completeCodeMessage(input: CompleteCodeMessageInput): Promise<void>;
  failCodeMessage(input: { messageId: string; summary: string }): Promise<void>;
  createAskAssistantMessage(
    input: CreateAskAssistantMessageInput
  ): Promise<Message>;
  updateThoughts(input: {
    messageId: string;
    thoughts: Thought[];
  }): Promise<void>;
}
