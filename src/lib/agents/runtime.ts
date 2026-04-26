import type { PlanOutput } from "./schemas";

export type AgentRuntimeEvent =
  | { type: "planner.started" }
  | { type: "planner.finished"; plan: PlanOutput }
  | { type: "planner.failed"; error: string };

export type AgentRuntimeHooks = {
  emit?: (event: AgentRuntimeEvent) => void | Promise<void>;
};
