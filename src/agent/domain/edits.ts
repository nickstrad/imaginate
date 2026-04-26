import { z } from "zod";
import type { Edit, EditResult } from "./types";

export const EDIT_SCHEMA = z.object({
  find: z.string(),
  replace: z.string(),
  expectedOccurrences: z.number().int().min(1).default(1),
});

export function applyEdit(content: string, edit: Edit): EditResult {
  if (edit.find.length === 0) {
    return { ok: false, error: "`find` must not be empty" };
  }
  const out: string[] = [];
  let cursor = 0;
  let count = 0;
  while (true) {
    const idx = content.indexOf(edit.find, cursor);
    if (idx < 0) {
      break;
    }
    out.push(content.slice(cursor, idx), edit.replace);
    cursor = idx + edit.find.length;
    count++;
  }
  if (count === 0) {
    return { ok: false, error: "`find` string not found" };
  }
  if (count !== edit.expectedOccurrences) {
    return {
      ok: false,
      error: `Found ${count} occurrences, expected ${edit.expectedOccurrences}. Refine \`find\` or pass expectedOccurrences=${count}.`,
    };
  }
  out.push(content.slice(cursor));
  return { ok: true, content: out.join(""), count };
}

export function truncateTo(s: string, max: number | undefined): string {
  if (max === undefined) {
    return s;
  }
  return s.length > max ? s.slice(0, max) : s;
}

export function exceedsLimit(len: number, max: number | undefined): boolean {
  return max !== undefined && len > max;
}
