import { describe, it, expect } from "vitest";
import { applyEdit, exceedsLimit, truncateTo } from "./edits";

describe("truncateTo / exceedsLimit", () => {
  it("returns input unchanged when max is undefined", () => {
    expect(truncateTo("hello", undefined)).toBe("hello");
    expect(exceedsLimit(1_000_000, undefined)).toBe(false);
  });
  it("truncates when over the limit", () => {
    expect(truncateTo("hello world", 5)).toBe("hello");
    expect(exceedsLimit(11, 5)).toBe(true);
  });
  it("does not truncate at exact boundary", () => {
    expect(truncateTo("hello", 5)).toBe("hello");
    expect(exceedsLimit(5, 5)).toBe(false);
  });
});

describe("applyEdit", () => {
  it("rejects empty find", () => {
    const r = applyEdit("abc", {
      find: "",
      replace: "x",
      expectedOccurrences: 1,
    });
    expect(r.ok).toBe(false);
  });
  it("rejects when find is not present", () => {
    const r = applyEdit("abc", {
      find: "xyz",
      replace: "q",
      expectedOccurrences: 1,
    });
    expect(r.ok).toBe(false);
  });
  it("replaces a single occurrence", () => {
    const r = applyEdit("foo bar foo", {
      find: "bar",
      replace: "BAZ",
      expectedOccurrences: 1,
    });
    expect(r).toEqual({ ok: true, content: "foo BAZ foo", count: 1 });
  });
  it("replaces multiple when expectedOccurrences matches", () => {
    const r = applyEdit("a-a-a", {
      find: "a",
      replace: "b",
      expectedOccurrences: 3,
    });
    expect(r).toEqual({ ok: true, content: "b-b-b", count: 3 });
  });
  it("fails when expectedOccurrences mismatches actual count", () => {
    const r = applyEdit("a-a-a", {
      find: "a",
      replace: "b",
      expectedOccurrences: 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Found 3 occurrences");
      expect(r.error).toContain("expectedOccurrences=3");
    }
  });
});
