import type { ModelMessage } from "ai";
import { prisma } from "@/platform/db";
import { MessageRole, MessageStatus } from "@/generated/prisma";

interface MessageRow {
  role: MessageRole;
  content: string;
}

export function toModelMessages(rows: readonly MessageRow[]): ModelMessage[] {
  return rows
    .map<ModelMessage>((m) => ({
      role: m.role === MessageRole.ASSISTANT ? "assistant" : "user",
      content: m.content,
    }))
    .reverse();
}

export async function getPreviousMessages(
  projectId: string
): Promise<ModelMessage[]> {
  const messages = await prisma.message.findMany({
    where: {
      projectId,
      content: { not: "" },
      status: { not: MessageStatus.PENDING },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return toModelMessages(messages);
}
