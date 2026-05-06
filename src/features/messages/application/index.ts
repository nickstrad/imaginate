import { MessageMode, type Fragment, type Message } from "@/generated/prisma";
import type { AgentMode, AgentRunIntent } from "@/shared/agent-mode";
import type { Thought } from "@/shared/schemas/thought";

export type { AgentMode, AgentRunIntent };

export type ProjectMessage = Omit<Message, "thoughts"> & {
  fragment: Fragment | null;
  thoughts?: Thought[];
};

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

function toMessageMode(mode: AgentMode): MessageMode {
  return mode === "ask" ? MessageMode.ASK : MessageMode.CODE;
}

export interface MessageWorkflow {
  createUserMessage(input: {
    projectId: string;
    userPrompt: string;
    mode: AgentMode;
  }): Promise<{ message: Message; agentRun: AgentRunIntent }>;
  listMessages(input: { projectId: string }): Promise<ProjectMessage[]>;
  createPendingCodeMessage(input: { projectId: string }): Promise<Message>;
  saveAnswerOnly(input: { messageId: string; answer: string }): Promise<void>;
  saveProviderError(input: {
    messageId: string;
    message: string;
  }): Promise<void>;
  completeCodeMessage(input: CompleteCodeMessageInput): Promise<void>;
  failCodeMessage(input: { messageId: string; summary: string }): Promise<void>;
  createAskMessage(input: CreateAskAssistantMessageInput): Promise<Message>;
  recordThoughts(input: {
    messageId: string;
    thoughts: Thought[];
  }): Promise<void>;
}

export function createMessageWorkflow(deps: {
  repository: MessageRepository;
}): MessageWorkflow {
  const { repository } = deps;
  return {
    async createUserMessage(input) {
      const exists = await repository.projectExists(input.projectId);
      if (!exists) {
        throw new MessageProjectNotFoundError(input.projectId);
      }
      const message = await repository.createUserMessageAndTouchProject({
        projectId: input.projectId,
        userPrompt: input.userPrompt,
        mode: toMessageMode(input.mode),
      });
      return {
        message,
        agentRun: {
          kind: "agent.run",
          mode: input.mode,
          projectId: input.projectId,
          userPrompt: input.userPrompt,
        },
      };
    },
    async listMessages(input) {
      return repository.listByProjectId(input.projectId);
    },
    async createPendingCodeMessage(input) {
      return repository.createPendingCodeAssistantMessage(input.projectId);
    },
    async saveAnswerOnly(input) {
      await repository.saveAnswerOnly(input);
    },
    async saveProviderError(input) {
      await repository.saveProviderError(input);
    },
    async completeCodeMessage(input) {
      await repository.completeCodeMessage(input);
    },
    async failCodeMessage(input) {
      await repository.failCodeMessage(input);
    },
    async createAskMessage(input) {
      return repository.createAskAssistantMessage(input);
    },
    async recordThoughts(input) {
      await repository.updateThoughts(input);
    },
  };
}
