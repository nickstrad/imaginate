import type { Workspace } from "./workspace";
import type { ToolSet } from "./model-gateway";
import type { PlanOutput, RunState } from "../domain/types";

export interface ToolFactoryContext {
  workspace: Workspace;
  runState: RunState;
}

export interface ToolFactory {
  createExecutorTools(ctx: ToolFactoryContext): ToolSet;
  createPlannerSubmitTool(opts: {
    onSubmit: (plan: PlanOutput) => void;
  }): ToolSet;
}
