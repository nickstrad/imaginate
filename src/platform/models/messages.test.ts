import { describe, expect, it } from "vitest";
import { MessageRole } from "@/generated/prisma";
import { toModelMessages } from "./messages";

describe("toModelMessages", () => {
  it("maps ASSISTANT → assistant and everything else → user, then reverses to chronological order", () => {
    const rows = [
      { role: MessageRole.ASSISTANT, content: "third" },
      { role: MessageRole.USER, content: "second" },
      { role: MessageRole.ASSISTANT, content: "first" },
    ];

    expect(toModelMessages(rows)).toEqual([
      { role: "assistant", content: "first" },
      { role: "user", content: "second" },
      { role: "assistant", content: "third" },
    ]);
  });

  it("returns an empty array for no rows", () => {
    expect(toModelMessages([])).toEqual([]);
  });
});
