import "server-only";
import fs from "node:fs";
import path from "node:path";
import { isProduction } from "@/platform/config/env";
import type { LogEntry } from "./schema";

export interface RunFileSink {
  filePath: string | null;
  write(entry: LogEntry): void;
  close(): Promise<void>;
}

const NOOP_SINK: RunFileSink = {
  filePath: null,
  write: () => {},
  close: async () => {},
};

interface RegisteredSink {
  write(entry: LogEntry): void;
  end(): Promise<void>;
}

const sinkWriters = new Map<string, RegisteredSink>();

export function getRunFileSinkWriter(
  runId: string
): ((entry: LogEntry) => void) | undefined {
  return sinkWriters.get(runId)?.write;
}

export function openRunFileSink(params: {
  runId: string;
  dir?: string;
}): RunFileSink {
  if (isProduction) {
    return NOOP_SINK;
  }
  // If a previous sink for this runId is still registered (e.g. an Inngest
  // retry re-entered the same module process before the prior `finally`),
  // close it before clobbering the registry entry.
  const existing = sinkWriters.get(params.runId);
  if (existing) {
    void existing.end();
  }

  const dir = params.dir ?? path.join(process.cwd(), "logs");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${params.runId}.jsonl`);
  const stream = fs.createWriteStream(filePath, { flags: "a" });

  const write = (entry: LogEntry) => {
    stream.write(`${JSON.stringify(entry)}\n`);
  };
  const end = () =>
    new Promise<void>((resolve) => {
      stream.end(() => {
        resolve();
      });
    });
  const registered: RegisteredSink = { write, end };
  sinkWriters.set(params.runId, registered);

  return {
    filePath,
    write,
    close: async () => {
      // Only deregister if a later open() for the same runId hasn't already
      // replaced us in the registry.
      if (sinkWriters.get(params.runId) === registered) {
        sinkWriters.delete(params.runId);
      }
      await end();
    },
  };
}
