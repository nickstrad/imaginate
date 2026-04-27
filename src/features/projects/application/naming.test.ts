import { describe, it, expect } from "vitest";
import {
  buildProjectName,
  PROJECT_NAME_MAX_LEN,
  placeholderName,
  sanitizeName,
  uuidSuffix,
} from "./naming";

describe("sanitizeName", () => {
  it("lowercases and replaces whitespace with dashes", () => {
    expect(sanitizeName("My Cool Project")).toBe("my-cool-project");
  });
  it("strips punctuation and collapses dashes", () => {
    expect(sanitizeName("Hello!!  World___123")).toBe("hello-world123");
  });
  it("trims leading/trailing dashes", () => {
    expect(sanitizeName("---abc---")).toBe("abc");
  });
  it("truncates to PROJECT_NAME_MAX_LEN", () => {
    const long = "a".repeat(100);
    expect(sanitizeName(long).length).toBe(PROJECT_NAME_MAX_LEN);
  });
  it("returns empty string for entirely-stripped input", () => {
    expect(sanitizeName("!!!")).toBe("");
  });
});

describe("uuidSuffix", () => {
  it("returns the first 5 chars of the given uuid", () => {
    expect(uuidSuffix("abcdef-1234-5678")).toBe("abcde");
  });
});

describe("placeholderName", () => {
  it("composes slug-suffix and respects max length", () => {
    expect(placeholderName("foo-bar", "12345")).toBe("foo-bar-12345");
    const longSlug = "a".repeat(60);
    expect(placeholderName(longSlug, "12345").length).toBe(
      PROJECT_NAME_MAX_LEN
    );
  });
});

describe("buildProjectName", () => {
  it("returns null for empty/null base", () => {
    expect(buildProjectName(null)).toBeNull();
    expect(buildProjectName("")).toBeNull();
  });
  it("returns null when sanitized base is shorter than 2 chars", () => {
    expect(buildProjectName("a", "12345")).toBeNull();
    expect(buildProjectName("!!!", "12345")).toBeNull();
  });
  it("builds sanitized name with suffix", () => {
    expect(buildProjectName("My Project", "12345")).toBe("my-project-12345");
  });
  it("never exceeds max length", () => {
    const long = "x".repeat(80);
    const name = buildProjectName(long, "12345");
    expect(name).not.toBeNull();
    expect(name!.length).toBeLessThanOrEqual(PROJECT_NAME_MAX_LEN);
  });
});
