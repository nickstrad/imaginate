import { describe, it, expect } from "vitest";
import {
  createRunState,
  hasSuccessfulVerification,
  inferVerificationKind,
  markVerification,
} from "./state";

describe("inferVerificationKind", () => {
  const cases: Array<[string, "build" | "test" | "lint" | null]> = [
    ["tsc --noEmit", "build"],
    ["npx tsc --noEmit -p tsconfig.json", "build"],
    ["next build", "build"],
    ["tsc", "build"],
    ["vitest", "test"],
    ["npm test", "test"],
    ["pnpm test", "test"],
    ["yarn test", "test"],
    ["jest --runInBand", "test"],
    ["eslint .", "lint"],
    ["next lint", "lint"],
    ["npm run lint", "lint"],
    ["echo hello", null],
    ["", null],
  ];
  for (const [cmd, expected] of cases) {
    it(`${JSON.stringify(cmd)} → ${expected}`, () => {
      expect(inferVerificationKind(cmd)).toBe(expected);
    });
  }
});

describe("RunState helpers", () => {
  it("createRunState gives a fresh state", () => {
    const s = createRunState();
    expect(s.totalAttempts).toBe(0);
    expect(s.escalatedTo).toBeNull();
    expect(s.verification).toEqual([]);
  });

  it("markVerification appends and hasSuccessfulVerification reflects success", () => {
    const s = createRunState();
    expect(hasSuccessfulVerification(s)).toBe(false);
    markVerification(s, "build", "tsc", false);
    expect(hasSuccessfulVerification(s)).toBe(false);
    markVerification(s, "build", "tsc", true);
    expect(hasSuccessfulVerification(s)).toBe(true);
    expect(s.verification).toHaveLength(2);
  });
});
