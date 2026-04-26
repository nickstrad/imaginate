import type { SandboxHandle } from "./sandbox-gateway";
import type { ToolSet } from "./model-gateway";
import type { PlanOutput, RunState } from "../domain/types";

export interface ToolFactoryContext {
  sandbox: SandboxHandle;
  runState: RunState;
}

export interface ToolFactory {
  createExecutorTools(ctx: ToolFactoryContext): ToolSet;
  createPlannerSubmitTool(opts: {
    onSubmit: (plan: PlanOutput) => void;
  }): ToolSet;
}
