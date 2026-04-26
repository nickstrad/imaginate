// Persistence port for assistant/user messages. Surface is intentionally
// minimal — chunk 04 will rewire src/inngest/functions.ts to use it; chunk
// 03 may extend it with thought/log persistence as the runtime moves.

export type MessageRole = "user" | "assistant" | "system";

export interface AppendMessageInput {
  projectId: string;
  content: string;
  role: MessageRole;
}

export interface AppendedMessage {
  messageId: string;
}

export interface MessageStore {
  appendUserMessage(input: {
    projectId: string;
    content: string;
  }): Promise<AppendedMessage>;
  appendAssistantMessage(input: AppendMessageInput): Promise<AppendedMessage>;
}
