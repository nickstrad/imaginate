import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentLogInput, AgentLogger } from "../../ports";

const generateTextMock = vi.hoisted(() => vi.fn());
type RecordingLogLevel = "debug" | "info" | "warn" | "error";
type RecordingLogEntry = {
  level: RecordingLogLevel;
  scope: string;
  event: string;
  metadata?: Record<string, unknown>;
  fileMetadata?: Record<string, unknown>;
};

vi.mock("ai", () => ({
  generateText: generateTextMock,
  tool: (def: unknown) => def,
}));

vi.mock("@/platform/models", () => ({
  EXECUTOR_LADDER: [{ provider: "openrouter", model: "executor" }],
  createModelProvider: () => ({ provider: "mock" }),
  fallbackSlugsFor: () => [],
  resolvePlannerModel: () => ({ provider: "openrouter", model: "planner" }),
  resolveSpec: (spec: { provider: string; model: string }) => spec,
}));

async function loadGatewayWithPayloadGate(enabled: boolean) {
  vi.resetModules();
  vi.doMock("@/platform/config/env", () => ({
    env: { LOG_LEVEL: "debug", LOG_PRETTY: "false", LOG_LLM_PAYLOADS: enabled },
    isProduction: false,
  }));
  const gatewayModule = await import("./model-gateway");
  return gatewayModule.createAiSdkModelGateway();
}

function createRecordingLogger(): AgentLogger & {
  entries: RecordingLogEntry[];
} {
  const entries: RecordingLogEntry[] = [];
  const make = (
    scope: string
  ): AgentLogger & {
    entries: RecordingLogEntry[];
  } => ({
    entries,
    debug: record(entries, scope, "debug"),
    info: record(entries, scope, "info"),
    warn: record(entries, scope, "warn"),
    error: record(entries, scope, "error"),
    child: ({ scope: childScope }: { scope: string }) =>
      make(`${scope}:${childScope}`),
  });
  return make("run");
}

function record(
  entries: RecordingLogEntry[],
  scope: string,
  level: RecordingLogLevel
) {
  return (input: AgentLogInput) => {
    entries.push({ level, scope, ...input });
  };
}

describe("createAiSdkModelGateway LLM logging", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.doUnmock("@/platform/config/env");
  });

  it("logs only summary metadata when LOG_LLM_PAYLOADS is false", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: "done",
      steps: [],
      usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
      finishReason: "stop",
    });
    const logger = createRecordingLogger();
    const gateway = await loadGatewayWithPayloadGate(false);

    await gateway.generateText({
      modelId: "openrouter:test-model",
      system: "system",
      messages: [{ role: "user", content: "hello" }],
      logger,
    });

    expect(logger.entries).toEqual([
      expect.objectContaining({
        level: "debug",
        scope: "run:llm",
        event: "llm call",
        metadata: {
          messageCount: 1,
          totalChars: "system".length + "hello".length,
          provider: "openrouter",
          model: "test-model",
          finishReason: "stop",
          usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
        },
        fileMetadata: undefined,
      }),
    ]);
  });

  it("adds full prompt and response as file-only metadata when LOG_LLM_PAYLOADS is true", async () => {
    const response = {
      text: "done",
      steps: [],
      usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
      finishReason: "stop",
    };
    generateTextMock.mockResolvedValueOnce(response);
    const logger = createRecordingLogger();
    const gateway = await loadGatewayWithPayloadGate(true);
    const messages = [{ role: "user" as const, content: "hello" }];

    await gateway.generateText({
      modelId: "openrouter:test-model",
      system: "system",
      messages,
      logger,
    });

    expect(logger.entries[0]).toMatchObject({
      level: "debug",
      scope: "run:llm",
      event: "llm call",
      metadata: {
        messageCount: 1,
        totalChars: "system".length + "hello".length,
      },
      fileMetadata: {
        prompt: {
          system: "system",
          messages,
        },
        response,
      },
    });
  });
});
