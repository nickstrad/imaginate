import { describe, expect, it } from "vitest";

import { AgentRuntimeEventType } from "../domain/events";
import {
  createFakeModelGateway,
  createFakeSandboxGateway,
  createInMemoryEventSink,
  createInMemoryMessageStore,
  createInMemoryTelemetryStore,
} from "./in-memory-stores";

describe("agent skeleton fakes", () => {
  it("in-memory message store round-trips appends and assigns unique ids", async () => {
    const store = createInMemoryMessageStore();
    const a = await store.appendUserMessage({
      projectId: "p1",
      content: "hello",
    });
    const b = await store.appendAssistantMessage({
      projectId: "p1",
      role: "assistant",
      content: "hi back",
    });
    expect(a.messageId).not.toEqual(b.messageId);
    expect(store.messages).toHaveLength(2);
    expect(store.messages[0]).toMatchObject({ role: "user", content: "hello" });
    expect(store.messages[1]).toMatchObject({
      role: "assistant",
      content: "hi back",
    });
  });

  it("in-memory event sink records emitted events in order", () => {
    const sink = createInMemoryEventSink();
    sink.emit({ type: AgentRuntimeEventType.PlannerStarted });
    sink.emit({
      type: AgentRuntimeEventType.ExecutorAttemptStarted,
      attempt: 1,
      model: "fake",
    });
    expect(sink.events.map((e) => e.type)).toEqual([
      AgentRuntimeEventType.PlannerStarted,
      AgentRuntimeEventType.ExecutorAttemptStarted,
    ]);
  });

  it("in-memory telemetry store upserts by messageId", async () => {
    const store = createInMemoryTelemetryStore();
    const base = {
      steps: 1,
      filesRead: 0,
      filesWritten: 0,
      commandsRun: 0,
      buildSucceeded: false,
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    };
    await store.upsert({
      where: { messageId: "m1" },
      create: { messageId: "m1", ...base },
      update: base,
    });
    await store.upsert({
      where: { messageId: "m1" },
      create: { messageId: "m1", ...base },
      update: { ...base, steps: 7 },
    });
    expect(store.records.get("m1")?.steps).toBe(7);
  });

  it("fake model gateway returns canned responses and records calls", async () => {
    const gw = createFakeModelGateway({
      responses: [{ steps: [{ stepIndex: 0, text: "hello" }], text: "hello" }],
    });
    const result = await gw.generateText({
      modelId: "test/model",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.text).toBe("hello");
    expect(gw.calls).toHaveLength(1);
    expect(gw.calls[0].modelId).toBe("test/model");
  });

  it("fake sandbox gateway proxies file IO and command queue", async () => {
    const gw = createFakeSandboxGateway({
      files: { "/a.txt": "alpha" },
      commandResponses: [
        { exitCode: 0, stdout: "ok", stderr: "" },
        { exitCode: 1, stdout: "", stderr: "boom" },
      ],
    });
    const sandbox = await gw.acquire();
    expect(await sandbox.files.read("/a.txt")).toBe("alpha");
    await sandbox.files.write("/b.txt", "beta");
    expect(gw.files.get("/b.txt")).toBe("beta");
    expect((await sandbox.commands.run("echo")).exitCode).toBe(0);
    expect((await sandbox.commands.run("false")).exitCode).toBe(1);
    expect(gw.commandsRun.map((c) => c.cmd)).toEqual(["echo", "false"]);
  });
});
