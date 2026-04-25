import type { ModelMessage } from "ai";
import { prisma } from "@/db";
import { MessageRole, MessageStatus } from "@/generated/prisma";
import type { MessageRow } from "./types";

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
