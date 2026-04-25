import { buildSystemPrompt, SEPARATOR } from "./assemble";
import {
  EXEC_IDENTITY,
  EXEC_WORKFLOW,
  EXEC_FINALIZE_RULES,
  EXEC_ENV_RULES,
  EXEC_FALLBACK,
} from "./sections";

export const EXECUTOR_PROMPT_BASE = buildSystemPrompt({
  base: [
    EXEC_IDENTITY,
    EXEC_WORKFLOW,
    EXEC_FINALIZE_RULES,
    EXEC_ENV_RULES,
    EXEC_FALLBACK,
  ],
});

export function buildExecutorSystemPrompt(planSnippet: string): string {
  return `${EXECUTOR_PROMPT_BASE}${SEPARATOR.cacheBoundary}Plan from planner:\n${planSnippet}`;
}
