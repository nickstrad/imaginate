import { generateText as defaultGenerateText } from "ai";
import { ThoughtSchema, type Thought } from "@/lib/schemas/thought";
import { createModelProvider } from "@/lib/models";
import type { ModelSpec, ResolvedModelConfig } from "@/lib/models";
import {
  buildExecutorSystemPrompt,
  CACHE_PROVIDER_OPTIONS,
} from "@/lib/prompts";
import { AGENT_CONFIG, TASK_SUMMARY_RE } from "./constants";
import { extractTaskSummary, shouldEscalate, stepTextOf } from "./decisions";
import { planSnippet } from "./planner";
import { addUsage, buildTelemetry, readUsage } from "./telemetry";
import {
  createApplyPatchTool,
  createFinalizeTool,
  createListFilesTool,
  createReadFilesTool,
  createReplaceInFileTool,
  createRunBuildTool,
  createRunLintTool,
  createRunTestsTool,
  createTerminalTool,
  createWriteFilesTool,
} from "./tools";
import {
  AgentRuntimeEventType,
  EscalateReason,
  type AgentStepSnapshot,
  type ExecutorAttemptResult,
  type RunCodingOpts,
} from "./runtime";

function toAgentStepSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stepResult: any
): AgentStepSnapshot {
  const stepText = stepTextOf(stepResult);
  const thought = ThoughtSchema.parse({
    stepIndex: stepResult.stepNumber,
    text: stepText,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toolCalls: stepResult.toolCalls?.map((tc: any) => ({
      toolName: tc.toolName,
      args: tc.input,
    })),
    toolResults: stepResult.toolResults?.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (tr: any) =>
        typeof tr.output === "string" ? tr.output : JSON.stringify(tr.output)
    ),
    reasoningText: stepResult.reasoning?.[0]?.text,
    finishReason: stepResult.finishReason,
  });
  return {
    stepIndex: stepResult.stepNumber,
    thought,
    finishReason: stepResult.finishReason,
  };
}

function extractTaskSummaryFallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any,
  thoughts: Thought[]
): string | null {
  function* candidates(): Iterable<string> {
    yield stepTextOf(result);
    for (const s of result?.steps ?? []) {
      yield stepTextOf(s);
    }
    for (const t of thoughts) {
      if (t.text) {
        yield t.text;
      }
    }
  }
  return extractTaskSummary(candidates());
}

export async function runExecutorOnce(
  spec: ModelSpec,
  modelConfig: ResolvedModelConfig,
  opts: RunCodingOpts
): Promise<ExecutorAttemptResult> {
  const {
    thoughts,
    cumulativeUsage,
    plan,
    runState,
    previousMessages,
    userPrompt,
    log,
    hooks,
  } = opts;

  runState.totalAttempts += 1;
  runState.escalatedTo = `${spec.provider}:${spec.model}`;

  const toolDeps = {
    getSandbox: hooks.getSandbox,
    runState,
  };

  const systemPrompt = buildExecutorSystemPrompt(planSnippet(plan));
  const generateText = opts.generateText ?? defaultGenerateText;

  try {
    const result = await generateText({
      model: createModelProvider(modelConfig),
      system: systemPrompt,
      messages: [...previousMessages, { role: "user", content: userPrompt }],
      tools: {
        terminal: createTerminalTool(toolDeps),
        listFiles: createListFilesTool(toolDeps),
        readFiles: createReadFilesTool(toolDeps),
        writeFiles: createWriteFilesTool(toolDeps),
        replaceInFile: createReplaceInFileTool(toolDeps),
        applyPatch: createApplyPatchTool(toolDeps),
        runBuild: createRunBuildTool(toolDeps),
        runTests: createRunTestsTool(toolDeps),
        runLint: createRunLintTool(toolDeps),
        finalize: createFinalizeTool(toolDeps),
      },
      providerOptions: CACHE_PROVIDER_OPTIONS,
      maxOutputTokens: AGENT_CONFIG.maxOutputTokens,
      stopWhen: [
        () => runState.finalOutput !== undefined,
        ({ steps }) => {
          const last = steps[steps.length - 1];
          const text = stepTextOf(last);
          return TASK_SUMMARY_RE.test(text);
        },
      ],
      onStepFinish: async (stepResult) => {
        const snapshot = toAgentStepSnapshot(stepResult);

        log.info({
          event: "agent step",
          metadata: {
            stepIndex: snapshot.stepIndex,
            finishReason: snapshot.finishReason,
            text:
              snapshot.thought.text.length > 300
                ? snapshot.thought.text.slice(0, 300) + "…"
                : snapshot.thought.text,
            toolCalls: snapshot.thought.toolCalls?.map((tc) => tc.toolName),
          },
        });

        thoughts.push(snapshot.thought);
        addUsage(cumulativeUsage, readUsage(stepResult.usage));

        const telemetryPromise = hooks.persistTelemetry
          ? Promise.resolve(
              hooks.persistTelemetry(
                buildTelemetry(
                  runState,
                  snapshot.stepIndex + 1,
                  cumulativeUsage
                )
              )
            ).catch((e) =>
              log.warn({
                event: "telemetry snapshot failed",
                metadata: { err: String(e) },
              })
            )
          : Promise.resolve();

        await Promise.all([
          hooks.emit?.({
            type: AgentRuntimeEventType.ExecutorStepFinished,
            step: snapshot,
          }),
          telemetryPromise,
        ]);
      },
    });

    if (!runState.finalOutput) {
      const fallback = extractTaskSummaryFallback(result, thoughts);
      if (fallback) {
        runState.finalOutput = {
          status: "success",
          title: "Fragment",
          summary: fallback,
          verification: runState.verification,
          nextSteps: [],
        };
      }
    }

    const stepsCount = Array.isArray(result?.steps) ? result.steps.length : 0;
    const decision = shouldEscalate(runState, result);
    return {
      result,
      stepsCount,
      escalated: decision.escalate,
      reason: decision.reason,
    };
  } catch (err) {
    return {
      result: null,
      stepsCount: 0,
      escalated: true,
      reason: EscalateReason.Exception,
      error: err,
    };
  }
}
