import {
  MessageMode,
  MessageRole,
  MessageStatus,
  MessageType,
  type Message,
  type Prisma,
} from "@/generated/prisma";
import { prisma } from "@/platform/db";
import { ThoughtsSchema, type Thought } from "@/shared/schemas/thought";

function thoughtsToPrismaJson(thoughts: Thought[]): Prisma.InputJsonValue {
  return ThoughtsSchema.parse(
    thoughts
  ) satisfies Thought[] as Prisma.InputJsonValue;
}
import type {
  CompleteCodeMessageInput,
  CreateAskAssistantMessageInput,
  CreateUserMessageInput,
  MessageRepository,
  ProjectMessage,
} from "../application";

function normalizeThoughts(thoughts: unknown): Thought[] | undefined {
  return (thoughts as Thought[] | null) ?? undefined;
}

export function createPrismaMessageRepository(): MessageRepository {
  return {
    async projectExists(projectId: string): Promise<boolean> {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      return project !== null;
    },
    async listByProjectId(projectId: string): Promise<ProjectMessage[]> {
      const messages = await prisma.message.findMany({
        where: { projectId },
        include: { fragment: true },
        orderBy: { updatedAt: "asc" },
      });
      return messages.map((message) => ({
        ...message,
        thoughts: normalizeThoughts(message.thoughts),
      }));
    },
    async createUserMessageAndTouchProject(
      input: CreateUserMessageInput
    ): Promise<Message> {
      const [createdMessage] = await prisma.$transaction([
        prisma.message.create({
          data: {
            projectId: input.projectId,
            content: input.userPrompt,
            role: MessageRole.USER,
            type: MessageType.RESULT,
            mode: input.mode,
          },
        }),
        prisma.project.update({
          where: { id: input.projectId },
          data: { updatedAt: new Date() },
        }),
      ]);
      return createdMessage;
    },
    createPendingCodeAssistantMessage(projectId: string): Promise<Message> {
      return prisma.message.create({
        data: {
          projectId,
          role: MessageRole.ASSISTANT,
          content: "",
          type: MessageType.RESULT,
          status: MessageStatus.PENDING,
          thoughts: [],
          mode: MessageMode.CODE,
        },
      });
    },
    async saveAnswerOnly(input: {
      messageId: string;
      answer: string;
    }): Promise<void> {
      await prisma.message.update({
        where: { id: input.messageId },
        data: {
          content: input.answer,
          type: MessageType.RESULT,
          status: MessageStatus.COMPLETE,
        },
      });
    },
    async saveProviderError(input: {
      messageId: string;
      message: string;
    }): Promise<void> {
      await prisma.message.update({
        where: { id: input.messageId },
        data: {
          content: input.message,
          type: MessageType.ERROR,
          status: MessageStatus.ERROR,
        },
      });
    },
    async completeCodeMessage(input: CompleteCodeMessageInput): Promise<void> {
      await prisma.message.update({
        where: { id: input.messageId },
        data: {
          content: input.summary,
          type: MessageType.RESULT,
          status: MessageStatus.COMPLETE,
          fragment: {
            create: {
              sandboxUrl: input.sandboxUrl,
              title: input.title,
              files: input.files,
            },
          },
        },
      });
    },
    async failCodeMessage(input: {
      messageId: string;
      summary: string;
    }): Promise<void> {
      await prisma.message.update({
        where: { id: input.messageId },
        data: {
          content: input.summary,
          type: MessageType.ERROR,
          status: MessageStatus.ERROR,
        },
      });
    },
    createAskAssistantMessage(
      input: CreateAskAssistantMessageInput
    ): Promise<Message> {
      return prisma.message.create({
        data: {
          projectId: input.projectId,
          content: input.content,
          role: MessageRole.ASSISTANT,
          type: input.type === "ERROR" ? MessageType.ERROR : MessageType.RESULT,
          status:
            input.type === "ERROR"
              ? MessageStatus.ERROR
              : MessageStatus.COMPLETE,
          mode: MessageMode.ASK,
        },
      });
    },
    async updateThoughts(input: {
      messageId: string;
      thoughts: Thought[];
    }): Promise<void> {
      await prisma.message.update({
        where: { id: input.messageId },
        data: { thoughts: thoughtsToPrismaJson(input.thoughts) },
      });
    },
  };
}
