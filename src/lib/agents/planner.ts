import { generateText, tool, type ModelMessage } from "ai";
import { PlanOutputSchema, type PlanOutput } from "./schemas";
import type { AgentRuntimeHooks } from "./runtime";
import type { Logger } from "@/lib/log";
import { createModelProvider, resolvePlannerModel } from "@/lib/models";
import { PLANNER_PROMPT, CACHE_PROVIDER_OPTIONS } from "@/lib/prompts";

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

const DEFAULT_PLAN: PlanOutput = {
  requiresCoding: true,
  taskType: "other",
  targetFiles: [],
  verification: "tsc",
  notes: "Planner produced no structured output; proceeding with defaults.",
};

export async function runPlanner(input: {
  userPrompt: string;
  previousMessages: ModelMessage[];
  log: Logger;
  hooks?: AgentRuntimeHooks;
}): Promise<PlanOutput> {
  const { userPrompt, previousMessages, log, hooks } = input;
  await hooks?.emit?.({ type: "planner.started" });

  const spec = resolvePlannerModel();
  let captured: PlanOutput | null = null;
  const submitPlan = tool({
    description: "Submit the structured plan for this run.",
    inputSchema: PlanOutputSchema,
    execute: async (planInput: PlanOutput) => {
      captured = planInput;
      return { received: true };
    },
  });

  let threw = false;
  try {
    await generateText({
      model: createModelProvider(spec),
      system: PLANNER_PROMPT,
      messages: [...previousMessages, { role: "user", content: userPrompt }],
      tools: { submitPlan },
      maxOutputTokens: 1024,
      stopWhen: [() => captured !== null],
      providerOptions: CACHE_PROVIDER_OPTIONS,
    });
  } catch (err) {
    threw = true;
    log.warn({ event: "planner failed", metadata: { err: String(err) } });
    await hooks?.emit?.({ type: "planner.failed", error: String(err) });
  }

  if (!captured && !threw) {
    log.warn({ event: "planner no output, using fallback" });
  }
  const plan = captured ?? DEFAULT_PLAN;
  await hooks?.emit?.({ type: "planner.finished", plan });
  return plan;
}
