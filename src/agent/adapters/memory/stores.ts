// In-memory adapter implementations for non-DB use cases (CLI, tests).
// This module is importable from production code paths via `@/agent`,
// unlike `agent/testing/**` which is reserved for test fixtures.

import type {
  AppendedMessage,
  MessageRole,
  MessageStore,
  TelemetryStore,
  TelemetryUpsertArgs,
} from "../../ports";
import type { PersistedTelemetry } from "../../domain/types";

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

export function createNoopTelemetryStore(): TelemetryStore {
  return {
    async upsert() {
      return undefined;
    },
  };
}
