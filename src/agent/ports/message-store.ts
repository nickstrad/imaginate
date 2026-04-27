// Persistence port for assistant/user messages. Surface is intentionally
// minimal; feature repositories own web/Inngest message persistence until the
// runtime needs this port to grow.

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
