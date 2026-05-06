import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogger } from "./index";
import { openRunFileSink, getRunFileSinkWriter } from "./file-sink";
import type { LogEntry } from "./schema";

function makeEntry(event: string): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level: "debug",
    scope: "test",
    event,
    metadata: { foo: "bar" },
  };
}

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "run-file-sink-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("openRunFileSink", () => {
  it("writes JSONL entries and closes the stream", async () => {
    const dir = makeTempDir();
    const runId = "proj-123";
    const sink = openRunFileSink({ runId, dir });

    expect(sink.filePath).toBe(path.join(dir, `${runId}.jsonl`));

    const a = makeEntry("alpha");
    const b = makeEntry("beta");
    sink.write(a);
    sink.write(b);

    await sink.close();

    const contents = fs.readFileSync(sink.filePath!, "utf8");
    const lines = contents.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({ event: "alpha" });
    expect(JSON.parse(lines[1])).toMatchObject({ event: "beta" });
  });

  it("registers a writer keyed by runId and unregisters on close", async () => {
    const dir = makeTempDir();
    const runId = "proj-register";
    const sink = openRunFileSink({ runId, dir });

    expect(getRunFileSinkWriter(runId)).toBeDefined();

    await sink.close();

    expect(getRunFileSinkWriter(runId)).toBeUndefined();
  });

  it("writes file-only metadata through run-scoped loggers", async () => {
    const dir = makeTempDir();
    const runId = "proj-file-metadata";
    const sink = openRunFileSink({ runId, dir });
    const logger = createLogger({ scope: "test", bindings: { runId } });

    logger.debug({
      event: "llm call",
      metadata: { messageCount: 1 },
      fileMetadata: { prompt: "full prompt" },
    });

    await sink.close();

    const contents = fs.readFileSync(sink.filePath!, "utf8");
    expect(JSON.parse(contents)).toMatchObject({
      event: "llm call",
      metadata: {
        runId,
        messageCount: 1,
        prompt: "full prompt",
      },
    });
  });
});
