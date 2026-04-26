import type {
  AgentEventSink,
  AgentLogger,
  AgentLogInput,
  AppendedMessage,
  GenerateTextRequest,
  GenerateTextResult,
  MessageRole,
  MessageStore,
  ModelGateway,
  SandboxCommandOptions,
  SandboxCommandResult,
  SandboxGateway,
  SandboxHandle,
  TelemetryStore,
  TelemetryUpsertArgs,
} from "../ports";
import type { AgentRuntimeEvent } from "../domain/events";
import type { PersistedTelemetry } from "../domain/types";

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

export interface FakeModelGatewayOptions {
  responses?: GenerateTextResult[];
}

export interface FakeModelGateway extends ModelGateway {
  readonly calls: ReadonlyArray<GenerateTextRequest>;
}

export function createFakeModelGateway(
  options: FakeModelGatewayOptions = {}
): FakeModelGateway {
  const queue = [...(options.responses ?? [])];
  const calls: GenerateTextRequest[] = [];
  return {
    get calls() {
      return calls;
    },
    async generateText(req) {
      calls.push(req);
      return queue.shift() ?? { steps: [] };
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
