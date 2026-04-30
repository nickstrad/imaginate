import type {
  AgentEventSink,
  AgentLogger,
  AgentLogInput,
  AppendedMessage,
  GenerateTextRequest,
  GenerateTextResult,
  MessageRole,
  MessageStore,
  ModelDescriptor,
  ModelGateway,
  ProviderErrorClassification,
  SandboxCommandOptions,
  SandboxCommandResult,
  SandboxGateway,
  SandboxHandle,
  TelemetryStore,
  TelemetryUpsertArgs,
  ToolFactory,
  ToolFactoryContext,
  ToolSet,
} from "../ports";
import { classifyAgentError } from "../domain/errors";
import type { AgentRuntimeEvent } from "../domain/events";
import type {
  FinalOutput,
  PersistedTelemetry,
  PlanOutput,
} from "../domain/types";

interface StoredMessage {
  messageId: string;
  projectId: string;
  role: MessageRole;
  content: string;
}

export interface InMemoryMessageStore extends MessageStore {
  readonly messages: ReadonlyArray<StoredMessage>;
}

export function createInMemoryMessageStore(): InMemoryMessageStore {
  const messages: StoredMessage[] = [];
  let seq = 0;
  const newId = () => `msg_${++seq}`;
  return {
    get messages() {
      return messages;
    },
    async appendUserMessage({ projectId, content }) {
      const messageId = newId();
      messages.push({ messageId, projectId, role: "user", content });
      return { messageId } satisfies AppendedMessage;
    },
    async appendAssistantMessage({ projectId, content, role }) {
      const messageId = newId();
      messages.push({ messageId, projectId, role, content });
      return { messageId } satisfies AppendedMessage;
    },
  };
}

export interface InMemoryTelemetryStore extends TelemetryStore {
  readonly records: ReadonlyMap<string, PersistedTelemetry>;
}

export function createInMemoryTelemetryStore(): InMemoryTelemetryStore {
  const records = new Map<string, PersistedTelemetry>();
  return {
    get records() {
      return records;
    },
    async upsert(args: TelemetryUpsertArgs) {
      const existing = records.get(args.where.messageId);
      records.set(
        args.where.messageId,
        existing ? { ...existing, ...args.update } : args.create
      );
      return undefined;
    },
  };
}

export interface InMemoryEventSink extends AgentEventSink {
  readonly events: ReadonlyArray<AgentRuntimeEvent>;
}

export function createInMemoryEventSink(): InMemoryEventSink {
  const events: AgentRuntimeEvent[] = [];
  return {
    get events() {
      return events;
    },
    emit(event) {
      events.push(event);
    },
  };
}

export function createNoopAgentLogger(): AgentLogger {
  const noop = (_input: AgentLogInput) => {};
  const logger: AgentLogger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => logger,
  };
  return logger;
}

export type FakeGenerateTextHandler = (
  req: GenerateTextRequest
) => Promise<GenerateTextResult> | GenerateTextResult;

export interface FakeModelGatewayOptions {
  responses?: Array<GenerateTextResult | FakeGenerateTextHandler | Error>;
  plannerModelId?: string;
  executorModelIds?: string[];
  describeModel?: (modelId: string) => ModelDescriptor;
  errorClassifier?: (err: unknown) => ProviderErrorClassification;
}

export interface FakeModelGateway extends ModelGateway {
  readonly calls: ReadonlyArray<GenerateTextRequest>;
}

function defaultDescribeModel(modelId: string): ModelDescriptor {
  const idx = modelId.indexOf(":");
  if (idx < 0) {
    return { provider: "fake", model: modelId };
  }
  return { provider: modelId.slice(0, idx), model: modelId.slice(idx + 1) };
}

export function createFakeModelGateway(
  options: FakeModelGatewayOptions = {}
): FakeModelGateway {
  const queue = [...(options.responses ?? [])];
  const calls: GenerateTextRequest[] = [];
  const plannerModelId = options.plannerModelId ?? "fake:planner";
  const executorModelIds = options.executorModelIds ?? [
    "fake:exec-a",
    "fake:exec-b",
    "fake:exec-c",
  ];
  const describeModel = options.describeModel ?? defaultDescribeModel;
  const errorClassifier =
    options.errorClassifier ?? ((err: unknown) => classifyAgentError(err));
  return {
    get calls() {
      return calls;
    },
    async generateText(req) {
      calls.push(req);
      const next = queue.shift();
      if (next instanceof Error) {
        throw next;
      }
      if (typeof next === "function") {
        return await next(req);
      }
      return next ?? { steps: [] };
    },
    resolvePlannerModelId() {
      return plannerModelId;
    },
    listExecutorModelIds() {
      return [...executorModelIds];
    },
    describeModel,
    classifyError(err) {
      return errorClassifier(err);
    },
  };
}

export interface FakeSandboxOptions {
  sandboxId?: string;
  files?: Record<string, string>;
  commandResponses?: SandboxCommandResult[];
  host?: string;
}

export interface FakeSandboxGateway extends SandboxGateway {
  readonly handle: SandboxHandle;
  readonly commandsRun: ReadonlyArray<{
    cmd: string;
    opts?: SandboxCommandOptions;
  }>;
  readonly files: ReadonlyMap<string, string>;
}

export function createFakeSandboxGateway(
  options: FakeSandboxOptions = {}
): FakeSandboxGateway {
  const sandboxId = options.sandboxId ?? "sbx_test";
  const fileMap = new Map(Object.entries(options.files ?? {}));
  const cmdQueue = [...(options.commandResponses ?? [])];
  const commandsRun: Array<{ cmd: string; opts?: SandboxCommandOptions }> = [];

  const handle: SandboxHandle = {
    sandboxId,
    commands: {
      async run(cmd, opts) {
        commandsRun.push({ cmd, opts });
        return cmdQueue.shift() ?? { exitCode: 0, stdout: "", stderr: "" };
      },
    },
    files: {
      async read(path) {
        const content = fileMap.get(path);
        if (content === undefined) {
          throw new Error(`fake sandbox: file not found: ${path}`);
        }
        return content;
      },
      async write(path, content) {
        fileMap.set(path, content);
      },
    },
    setTimeout() {},
    getHost(port) {
      const base = options.host ?? "fake.local";
      return port === undefined ? base : `${base}:${port}`;
    },
  };

  return {
    get handle() {
      return handle;
    },
    get commandsRun() {
      return commandsRun;
    },
    get files() {
      return fileMap;
    },
    async acquire() {
      return handle;
    },
  };
}

export interface FakeToolFactoryOptions {
  onFinalize?: (ctx: ToolFactoryContext, output: FinalOutput) => void;
  onWrite?: (ctx: ToolFactoryContext, path: string, content: string) => void;
}

export function createFakeToolFactory(
  options: FakeToolFactoryOptions = {}
): ToolFactory {
  return {
    createExecutorTools(ctx: ToolFactoryContext): ToolSet {
      return {
        finalize: {
          description: "fake finalize",
          inputSchema: {},
          execute: async (input: unknown) => {
            const output = input as FinalOutput;
            ctx.runState.finalOutput = output;
            options.onFinalize?.(ctx, output);
            return { success: true, status: output.status };
          },
        },
        writeFiles: {
          description: "fake writeFiles",
          inputSchema: {},
          execute: async (input: unknown) => {
            const { files = [] } =
              (input as { files?: Array<{ path: string; content: string }> }) ??
              {};
            for (const f of files) {
              ctx.runState.filesWritten[f.path] = f.content;
              options.onWrite?.(ctx, f.path, f.content);
            }
            return { success: true };
          },
        },
      };
    },
    createPlannerSubmitTool({ onSubmit }) {
      return {
        submitPlan: {
          description: "fake submitPlan",
          inputSchema: {},
          execute: async (input: unknown) => {
            onSubmit(input as PlanOutput);
            return { received: true };
          },
        },
      };
    },
  };
}
