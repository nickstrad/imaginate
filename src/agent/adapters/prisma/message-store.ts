import { prisma } from "@/lib/db";
import { MessageRole, MessageStatus, MessageType } from "@/generated/prisma";
import type {
  AppendedMessage,
  MessageRole as PortMessageRole,
  MessageStore,
} from "../../ports";

function mapRole(role: PortMessageRole): MessageRole {
  switch (role) {
    case "user": {
      return MessageRole.USER;
    }
    case "assistant": {
      return MessageRole.ASSISTANT;
    }
    case "system": {
      return MessageRole.ASSISTANT;
    }
  }
}

export function createPrismaMessageStore(): MessageStore {
  return {
    async appendUserMessage({ projectId, content }): Promise<AppendedMessage> {
      const message = await prisma.message.create({
        data: {
          projectId,
          role: MessageRole.USER,
          content,
          type: MessageType.RESULT,
          status: MessageStatus.COMPLETE,
          thoughts: [],
        },
      });
      return { messageId: message.id };
    },
    async appendAssistantMessage({
      projectId,
      content,
      role,
    }): Promise<AppendedMessage> {
      const message = await prisma.message.create({
        data: {
          projectId,
          role: mapRole(role),
          content,
          type: MessageType.RESULT,
          status: MessageStatus.PENDING,
          thoughts: [],
        },
      });
      return { messageId: message.id };
    },
  };
}
