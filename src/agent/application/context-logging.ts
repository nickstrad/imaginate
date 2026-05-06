import type { AgentLogger } from "../ports";

export type ContextMutationOp = "append" | "trim" | "summarize" | "replace";

export function logContextMutation(params: {
  logger: AgentLogger;
  op: ContextMutationOp;
  before: number;
  after: number;
  reason: string;
}): void {
  params.logger.child({ scope: "context" }).info({
    event: "context mutation",
    metadata: {
      op: params.op,
      before: params.before,
      after: params.after,
      reason: params.reason,
    },
  });
}
