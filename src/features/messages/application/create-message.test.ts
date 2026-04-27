import { describe, expect, it } from "vitest";
import {
  MessageMode,
  MessageRole,
  MessageStatus,
  MessageType,
  type Message,
} from "@/generated/prisma";
import { createUserMessage } from "./create-message";
import {
  MessageProjectNotFoundError,
  type CreateUserMessageInput,
  type MessageRepository,
} from "./repository";

function makeMessage(input: CreateUserMessageInput): Message {
  return {
    id: "message-1",
    content: input.userPrompt,
    role: MessageRole.USER,
    type: MessageType.RESULT,
    mode: input.mode,
    status: MessageStatus.COMPLETE,
    thoughts: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    projectId: input.projectId,
  };
}

function makeRepository(args: {
  exists: boolean;
  calls: CreateUserMessageInput[];
}): MessageRepository {
  return {
    projectExists: async () => args.exists,
    listByProjectId: async () => [],
    createUserMessageAndTouchProject: async (input) => {
      args.calls.push(input);
      return makeMessage(input);
    },
    createPendingCodeAssistantMessage: async () => {
      throw new Error("not used");
    },
    saveAnswerOnly: async () => undefined,
    saveProviderError: async () => undefined,
    completeCodeMessage: async () => undefined,
    failCodeMessage: async () => undefined,
    createAskAssistantMessage: async () => {
      throw new Error("not used");
    },
    updateThoughts: async () => undefined,
  };
}

describe("createUserMessage", () => {
  it("creates a user message and returns an agent run intent", async () => {
    const calls: CreateUserMessageInput[] = [];
    const result = await createUserMessage(
      { projectId: "project-1", userPrompt: "Explain this app", mode: "ask" },
      { repository: makeRepository({ exists: true, calls }) }
    );

    expect(calls).toEqual([
      {
        projectId: "project-1",
        userPrompt: "Explain this app",
        mode: MessageMode.ASK,
      },
    ]);
    expect(result.message.id).toBe("message-1");
    expect(result.agentRun).toEqual({
      kind: "agent.run",
      mode: "ask",
      projectId: "project-1",
      userPrompt: "Explain this app",
    });
  });

  it("throws when the project does not exist", async () => {
    await expect(
      createUserMessage(
        { projectId: "missing", userPrompt: "hello", mode: "code" },
        { repository: makeRepository({ exists: false, calls: [] }) }
      )
    ).rejects.toBeInstanceOf(MessageProjectNotFoundError);
  });
});
