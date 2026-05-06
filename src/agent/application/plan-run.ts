import { AgentRuntimeEventType } from "../domain/events";
import type { PlanOutput } from "../domain/types";
import type {
  AgentEventSink,
  AgentLogger,
  ModelGateway,
  ModelMessage,
  ToolFactory,
} from "../ports";

export const DEFAULT_PLAN: PlanOutput = {
  requiresCoding: true,
  taskType: "other",
  targetFiles: [],
  verification: "tsc",
  notes: "Planner produced no structured output; proceeding with defaults.",
};

export function planSnippet(plan: PlanOutput | undefined): string {
  if (!plan) {
    return "(no plan available)";
  }
  const files = plan.targetFiles.length
    ? plan.targetFiles.join(", ")
    : "(none inferred)";
  return [
    `taskType: ${plan.taskType}`,
    `targetFiles: ${files}`,
    `verification: ${plan.verification}`,
    `notes: ${plan.notes || "(none)"}`,
  ].join("\n");
}

export interface PlanRunInput {
  previousMessages: ModelMessage[];
  plannerSystemPrompt: string;
  providerCacheOptions?: Record<string, unknown>;
}

export interface PlanRunDeps {
  modelGateway: ModelGateway;
  toolFactory: ToolFactory;
  eventSink: AgentEventSink;
  logger: AgentLogger;
}

export async function planRun(args: {
  input: PlanRunInput;
  deps: PlanRunDeps;
}): Promise<PlanOutput> {
  const { input, deps } = args;
  await deps.eventSink.emit({ type: AgentRuntimeEventType.PlannerStarted });

  let captured: PlanOutput | null = null;
  const tools = deps.toolFactory.createPlannerSubmitTool({
    onSubmit: (plan) => {
      captured = plan;
    },
  });

  const modelId = deps.modelGateway.resolvePlannerModelId();

  try {
    await deps.modelGateway.generateText({
      modelId,
      system: input.plannerSystemPrompt,
      messages: input.previousMessages,
      logger: deps.logger,
      tools,
      maxOutputTokens: 1024,
      providerOptions: input.providerCacheOptions,
      stopWhen: [() => captured !== null],
    });
  } catch (err) {
    deps.logger.error({
      event: "planner failed",
      metadata: { err },
    });
    await deps.eventSink.emit({
      type: AgentRuntimeEventType.PlannerFailed,
      error: String(err),
    });
    throw err;
  }

  if (!captured) {
    deps.logger.warn({ event: "planner no output, using fallback" });
  }

  const plan: PlanOutput = captured ?? DEFAULT_PLAN;
  await deps.eventSink.emit({
    type: AgentRuntimeEventType.PlannerFinished,
    plan,
  });
  return plan;
}
