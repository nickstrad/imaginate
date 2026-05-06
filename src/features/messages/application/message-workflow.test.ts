import { describe, expect, it } from "vitest";
import {
  MessageMode,
  MessageRole,
  MessageStatus,
  MessageType,
  type Message,
} from "@/generated/prisma";
import {
  createMessageWorkflow,
  MessageProjectNotFoundError,
  type MessageRepository,
  type ProjectMessage,
} from ".";

type RecorderState = {
  exists: boolean;
  pending: Message[];
  answers: { messageId: string; answer: string }[];
  errors: { messageId: string; message: string }[];
  completed: Array<{
    messageId: string;
    summary: string;
    title: string;
    sandboxUrl: string;
    files: Record<string, string>;
  }>;
  failed: { messageId: string; summary: string }[];
  asks: Array<{
    projectId: string;
    content: string;
    type: "ERROR" | "RESULT";
  }>;
  thoughts: { messageId: string; thoughts: unknown[] }[];
  list: ProjectMessage[];
  userCreated: Array<{
    projectId: string;
    userPrompt: string;
    mode: MessageMode;
  }>;
};

function makeMessage(over: Partial<Message> & { id: string }): Message {
  return {
    id: over.id,
    content: over.content ?? "",
    role: over.role ?? MessageRole.USER,
    type: over.type ?? MessageType.RESULT,
    mode: over.mode ?? MessageMode.CODE,
    status: over.status ?? MessageStatus.COMPLETE,
    thoughts: over.thoughts ?? null,
    createdAt: over.createdAt ?? new Date("2026-01-01T00:00:00Z"),
    updatedAt: over.updatedAt ?? new Date("2026-01-01T00:00:00Z"),
    projectId: over.projectId ?? "project-1",
  };
}

function makeRepository(state: RecorderState): MessageRepository {
  return {
    projectExists: async () => state.exists,
    listByProjectId: async () => state.list,
    createUserMessageAndTouchProject: async (input) => {
      state.userCreated.push(input);
      return makeMessage({
        id: `user-${state.userCreated.length}`,
        content: input.userPrompt,
        role: MessageRole.USER,
        mode: input.mode,
        projectId: input.projectId,
      });
    },
    createPendingCodeAssistantMessage: async (projectId) => {
      const message = makeMessage({
        id: `pending-${state.pending.length + 1}`,
        role: MessageRole.ASSISTANT,
        status: MessageStatus.PENDING,
        projectId,
      });
      state.pending.push(message);
      return message;
    },
    saveAnswerOnly: async (input) => {
      state.answers.push(input);
    },
    saveProviderError: async (input) => {
      state.errors.push(input);
    },
    completeCodeMessage: async (input) => {
      state.completed.push(input);
    },
    failCodeMessage: async (input) => {
      state.failed.push(input);
    },
    createAskAssistantMessage: async (input) => {
      state.asks.push(input);
      return makeMessage({
        id: `ask-${state.asks.length}`,
        role: MessageRole.ASSISTANT,
        mode: MessageMode.ASK,
        type: input.type === "ERROR" ? MessageType.ERROR : MessageType.RESULT,
        projectId: input.projectId,
        content: input.content,
      });
    },
    updateThoughts: async (input) => {
      state.thoughts.push({
        messageId: input.messageId,
        thoughts: input.thoughts,
      });
    },
  };
}

function blankState(over: Partial<RecorderState> = {}): RecorderState {
  return {
    exists: true,
    pending: [],
    answers: [],
    errors: [],
    completed: [],
    failed: [],
    asks: [],
    thoughts: [],
    list: [],
    userCreated: [],
    ...over,
  };
}

describe("createMessageWorkflow", () => {
  describe("createUserMessage", () => {
    it("creates a user message and returns the agent run intent", async () => {
      const state = blankState();
      const wf = createMessageWorkflow({ repository: makeRepository(state) });
      const result = await wf.createUserMessage({
        projectId: "project-1",
        userPrompt: "Build something",
        mode: "code",
      });
      expect(state.userCreated).toEqual([
        {
          projectId: "project-1",
          userPrompt: "Build something",
          mode: MessageMode.CODE,
        },
      ]);
      expect(result.message.id).toBe("user-1");
      expect(result.agentRun).toEqual({
        kind: "agent.run",
        mode: "code",
        projectId: "project-1",
        userPrompt: "Build something",
      });
    });

    it("throws MessageProjectNotFoundError when the project is missing", async () => {
      const state = blankState({ exists: false });
      const wf = createMessageWorkflow({ repository: makeRepository(state) });
      await expect(
        wf.createUserMessage({
          projectId: "missing",
          userPrompt: "hello",
          mode: "ask",
        })
      ).rejects.toBeInstanceOf(MessageProjectNotFoundError);
      expect(state.userCreated).toEqual([]);
    });
  });

  describe("listMessages", () => {
    it("returns whatever the repo lists for the project", async () => {
      const list: ProjectMessage[] = [
        {
          ...makeMessage({ id: "m-1" }),
          fragment: null,
        } as ProjectMessage,
      ];
      const state = blankState({ list });
      const wf = createMessageWorkflow({ repository: makeRepository(state) });
      await expect(wf.listMessages({ projectId: "project-1" })).resolves.toBe(
        list
      );
    });
  });

  describe("createPendingCodeMessage", () => {
    it("forwards the project ID to the repository", async () => {
      const state = blankState();
      const wf = createMessageWorkflow({ repository: makeRepository(state) });
      const message = await wf.createPendingCodeMessage({
        projectId: "project-1",
      });
      expect(state.pending).toHaveLength(1);
      expect(state.pending[0].projectId).toBe("project-1");
      expect(message.id).toBe("pending-1");
    });
  });

  describe("saveAnswerOnly / saveProviderError", () => {
    it("forwards the answer and provider-error payloads", async () => {
      const state = blankState();
      const wf = createMessageWorkflow({ repository: makeRepository(state) });
      await wf.saveAnswerOnly({ messageId: "m-1", answer: "answer text" });
      await wf.saveProviderError({ messageId: "m-2", message: "boom" });
      expect(state.answers).toEqual([
        { messageId: "m-1", answer: "answer text" },
      ]);
      expect(state.errors).toEqual([{ messageId: "m-2", message: "boom" }]);
    });
  });

  describe("completeCodeMessage / failCodeMessage", () => {
    it("forwards the completion payload, including files and sandbox URL", async () => {
      const state = blankState();
      const wf = createMessageWorkflow({ repository: makeRepository(state) });
      await wf.completeCodeMessage({
        messageId: "m-3",
        summary: "shipped",
        title: "Title",
        sandboxUrl: "https://sandbox/x",
        files: { "app/page.tsx": "..." },
      });
      await wf.failCodeMessage({ messageId: "m-4", summary: "stuck" });
      expect(state.completed).toEqual([
        {
          messageId: "m-3",
          summary: "shipped",
          title: "Title",
          sandboxUrl: "https://sandbox/x",
          files: { "app/page.tsx": "..." },
        },
      ]);
      expect(state.failed).toEqual([{ messageId: "m-4", summary: "stuck" }]);
    });
  });

  describe("createAskMessage", () => {
    it("creates an ask assistant message with the right type", async () => {
      const state = blankState();
      const wf = createMessageWorkflow({ repository: makeRepository(state) });
      const okMessage = await wf.createAskMessage({
        projectId: "project-1",
        content: "answer",
        type: "RESULT",
      });
      const errMessage = await wf.createAskMessage({
        projectId: "project-1",
        content: "ouch",
        type: "ERROR",
      });
      expect(state.asks).toEqual([
        { projectId: "project-1", content: "answer", type: "RESULT" },
        { projectId: "project-1", content: "ouch", type: "ERROR" },
      ]);
      expect(okMessage.type).toBe(MessageType.RESULT);
      expect(errMessage.type).toBe(MessageType.ERROR);
    });
  });

  describe("recordThoughts", () => {
    it("forwards thoughts to the repository update", async () => {
      const state = blankState();
      const wf = createMessageWorkflow({ repository: makeRepository(state) });
      const thoughts = [{ stepIndex: 0, text: "thinking" }];
      await wf.recordThoughts({ messageId: "m-5", thoughts });
      expect(state.thoughts).toEqual([{ messageId: "m-5", thoughts }]);
    });
  });
});
