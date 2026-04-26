import { generateText, type ModelMessage } from "ai";
import { Sandbox } from "@e2b/code-interpreter";
import { inngest } from "./client";
import {
  ensurePreviewReady,
  getSandbox,
  getSandboxUrl,
  SANDBOX_DEFAULT_TIMEOUT_MS,
} from "@/lib/sandbox";
import {
  AGENT_CONFIG,
  buildTelemetry,
  createApplyPatchTool,
  createFinalizeTool,
  createListFilesTool,
  createReadFilesTool,
  createReplaceInFileTool,
  createRunBuildTool,
  createRunLintTool,
  createRunTestsTool,
  createRunState,
  createTerminalTool,
  createWriteFilesTool,
  extractTaskSummary,
  isFinalOutputAcceptable,
  persistTelemetry,
  planSnippet,
  readUsage,
  runPlanner,
  shouldEscalate,
  stepTextOf,
  TASK_SUMMARY_RE,
  type FinalOutput,
  type PlanOutput,
  type RunState,
} from "@/lib/agents";
import { createLogger, timed, type Logger } from "@/lib/log";
import {
  createModelProvider,
  EXECUTOR_LADDER,
  getPreviousMessages,
  resolvePlannerModel,
  resolveSpec,
  type ModelSpec,
  type ResolvedModelConfig,
} from "@/lib/models";
import {
  buildExecutorSystemPrompt,
  ASK_AGENT_PROMPT,
  CACHE_PROVIDER_OPTIONS,
} from "@/lib/prompts";
import { classifyProviderError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import {
  MessageRole,
  MessageType,
  MessageStatus,
  MessageMode,
} from "@/generated/prisma";
import {
  ThoughtSchema,
  thoughtsToPrismaJson,
  type Thought,
} from "@/lib/schemas/thought";

type StepCtx = {
  run: (id: string, fn: () => Promise<unknown>) => Promise<unknown>;
};

function loggedStep<T>(
  log: Logger,
  step: StepCtx,
  id: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  return timed({
    logger: log,
    event: id,
    metadata,
    fn: () => step.run(id, fn) as Promise<T>,
  });
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

type ExecutorAttemptResult = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any;
  escalated: boolean;
  reason?: string;
  error?: unknown;
};

type RunCodingOpts = {
  persistedMessageId: string;
  thoughts: Thought[];
  cumulativeUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  plan: PlanOutput;
  runState: RunState;
  previousMessages: ModelMessage[];
  userPrompt: string;
  sandboxId: string;
  log: Logger;
};

async function runExecutorOnce(
  spec: ModelSpec,
  modelConfig: ResolvedModelConfig,
  opts: RunCodingOpts
): Promise<ExecutorAttemptResult> {
  const {
    persistedMessageId,
    thoughts,
    cumulativeUsage,
    plan,
    runState,
    previousMessages,
    userPrompt,
    sandboxId,
    log,
  } = opts;

  runState.totalAttempts += 1;
  runState.escalatedTo = `${spec.provider}:${spec.model}`;

  const toolDeps = {
    getSandbox: () => getSandbox(sandboxId),
    runState,
  };

  const systemPrompt = buildExecutorSystemPrompt(planSnippet(plan));

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
        const stepText = stepTextOf(stepResult);

        log.info({
          event: "agent step",
          metadata: {
            stepIndex: stepResult.stepNumber,
            finishReason: stepResult.finishReason,
            text:
              stepText.length > 300 ? stepText.slice(0, 300) + "…" : stepText,
            toolCalls: stepResult.toolCalls?.map((tc) => tc.toolName),
          },
        });

        const newThought = ThoughtSchema.parse({
          stepIndex: stepResult.stepNumber,
          text: stepText,
          toolCalls: stepResult.toolCalls?.map((tc) => ({
            toolName: tc.toolName,
            args: tc.input,
          })),
          toolResults: stepResult.toolResults?.map((tr) =>
            typeof tr.output === "string"
              ? tr.output
              : JSON.stringify(tr.output)
          ),
          reasoningText: stepResult.reasoning?.[0]?.text,
          finishReason: stepResult.finishReason,
        });
        thoughts.push(newThought);

        const usage = readUsage(stepResult.usage);
        cumulativeUsage.promptTokens += usage.promptTokens;
        cumulativeUsage.completionTokens += usage.completionTokens;
        cumulativeUsage.totalTokens += usage.totalTokens;

        const stepsCompleted = stepResult.stepNumber + 1;
        await Promise.all([
          prisma.message.update({
            where: { id: persistedMessageId },
            data: { thoughts: thoughtsToPrismaJson(thoughts) },
          }),
          persistTelemetry(
            persistedMessageId,
            buildTelemetry(runState, stepsCompleted, cumulativeUsage)
          ).catch((e) =>
            log.warn({
              event: "telemetry snapshot failed",
              metadata: { err: String(e) },
            })
          ),
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

    const decision = shouldEscalate(runState, result);
    return { result, escalated: decision.escalate, reason: decision.reason };
  } catch (err) {
    return { result: null, escalated: true, reason: "exception", error: err };
  }
}

type ExecuteOutcome = {
  runState: RunState;
  stepsCount: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  lastErrorMessage: string | null;
};

async function runCodingAgentWithEscalation(
  opts: RunCodingOpts
): Promise<ExecuteOutcome> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastResult: any = null;
  let lastError: unknown;

  for (let i = 0; i < EXECUTOR_LADDER.length; i++) {
    const spec = EXECUTOR_LADDER[i];
    let modelConfig: ResolvedModelConfig;
    try {
      modelConfig = resolveSpec(spec);
    } catch (err) {
      opts.log.warn({
        event: "ladder slot unavailable",
        metadata: { spec, err: String(err) },
      });
      lastError = err;
      continue;
    }

    opts.log.info({
      event: "executor attempt",
      metadata: {
        attempt: i + 1,
        model: `${modelConfig.provider}:${modelConfig.model}`,
      },
    });

    const outcome = await runExecutorOnce(spec, modelConfig, opts);
    lastResult = outcome.result;

    if (outcome.error) {
      const classified = classifyProviderError(outcome.error);
      lastError = outcome.error;
      opts.log.warn({
        event: "executor threw",
        metadata: {
          attempt: i + 1,
          category: classified.category,
          retryable: classified.retryable,
        },
      });
      if (!classified.retryable) break;
      continue;
    }

    if (!outcome.escalated) {
      opts.log.info({
        event: "executor accepted",
        metadata: { attempt: i + 1 },
      });
      break;
    }

    opts.log.info({
      event: "escalating",
      metadata: { attempt: i + 1, reason: outcome.reason },
    });
  }

  const stepsCount = Array.isArray(lastResult?.steps)
    ? lastResult.steps.length
    : 0;

  return {
    runState: opts.runState,
    stepsCount,
    usage: opts.cumulativeUsage,
    lastErrorMessage:
      lastError === undefined
        ? null
        : lastError instanceof Error
          ? lastError.message
          : String(lastError),
  };
}

export const codeAgentFunction = inngest.createFunction(
  { id: "codeAgent" },
  { event: "codeAgent/run" },
  async ({ event, step }) => {
    const log = createLogger({
      scope: "inngest:codeAgent",
      bindings: {
        projectId: event.data.projectId as string,
        eventId: event.id,
      },
    });

    await step.run("log-run-start", async () => {
      log.info({ event: "run start" });
    });

    const persistedMessage = await loggedStep(log, step, "create-message", () =>
      prisma.message.create({
        data: {
          projectId: event.data.projectId,
          role: MessageRole.ASSISTANT,
          content: "",
          type: MessageType.RESULT,
          status: MessageStatus.PENDING,
          thoughts: [],
        },
      })
    );

    const previousMessages = await loggedStep(
      log,
      step,
      "get-previous-messages",
      () => getPreviousMessages(event.data.projectId)
    );

    const userPrompt = event.data.userPrompt as string;
    const runState = createRunState();
    const thoughts: Thought[] = [];
    const cumulativeUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    const plan = await loggedStep(log, step, "plan", () =>
      runPlanner({
        userPrompt,
        previousMessages: previousMessages as ModelMessage[],
        log,
      })
    );
    runState.plan = plan;

    if (!plan.requiresCoding) {
      log.info({
        event: "plan: no coding required",
        metadata: { taskType: plan.taskType },
      });
      const answer =
        plan.answer?.trim() ||
        "I reviewed your request — no code changes were required.";
      await loggedStep(log, step, "save-answer-only", () =>
        prisma.message.update({
          where: { id: persistedMessage.id },
          data: {
            content: answer,
            type: MessageType.RESULT,
            status: MessageStatus.COMPLETE,
          },
        })
      );
      const telemetry = buildTelemetry(runState, 0, cumulativeUsage);
      await loggedStep(
        log,
        step,
        "save-telemetry",
        () => persistTelemetry(persistedMessage.id, telemetry),
        telemetry
      );
      return { answer, plan };
    }

    const sandboxId = await loggedStep(
      log,
      step,
      "get-sandbox-id",
      async () => {
        const sandbox = await Sandbox.create("imaginate-dev");
        await sandbox.setTimeout(SANDBOX_DEFAULT_TIMEOUT_MS);
        return sandbox.sandboxId;
      }
    );

    const executeOutcome = await loggedStep(log, step, "execute", () =>
      runCodingAgentWithEscalation({
        persistedMessageId: persistedMessage.id,
        thoughts,
        cumulativeUsage,
        plan,
        runState,
        previousMessages: previousMessages as ModelMessage[],
        userPrompt,
        sandboxId,
        log,
      })
    );

    // Restore post-step state from the cached step return (Inngest replays don't
    // re-run step.run callbacks, so in-closure runState mutations are lost).
    const finalRunState = executeOutcome.runState;
    const finalOutput: FinalOutput | undefined = finalRunState.finalOutput;

    if (executeOutcome.lastErrorMessage && !finalOutput) {
      const classified = classifyProviderError(executeOutcome.lastErrorMessage);
      await loggedStep(log, step, "save-provider-error", () =>
        prisma.message.update({
          where: { id: persistedMessage.id },
          data: {
            content: classified.userMessage,
            type: MessageType.ERROR,
            status: MessageStatus.ERROR,
          },
        })
      );
      return { error: classified.userMessage, category: classified.category };
    }

    const isError = !finalOutput || finalOutput.status === "failed";

    const sandboxUrl = await loggedStep(
      log,
      step,
      "get-sandbox-url",
      async () => {
        const sandbox = await getSandbox(sandboxId);
        await ensurePreviewReady(sandbox);
        return getSandboxUrl(sandbox);
      }
    );

    await loggedStep(
      log,
      step,
      "save-result",
      () =>
        isError
          ? prisma.message.update({
              where: { id: persistedMessage.id },
              data: {
                content:
                  finalOutput?.summary ??
                  "Something went wrong. Please try again..",
                type: MessageType.ERROR,
                status: MessageStatus.ERROR,
              },
            })
          : prisma.message.update({
              where: { id: persistedMessage.id },
              data: {
                content: finalOutput!.summary,
                type: MessageType.RESULT,
                status: MessageStatus.COMPLETE,
                fragment: {
                  create: {
                    sandboxUrl,
                    title: finalOutput!.title,
                    files: finalRunState.filesWritten,
                  },
                },
              },
            }),
      { isError }
    );

    const telemetry = buildTelemetry(
      finalRunState,
      executeOutcome.stepsCount,
      executeOutcome.usage
    );
    await loggedStep(
      log,
      step,
      "save-telemetry",
      () => persistTelemetry(persistedMessage.id, telemetry),
      telemetry
    );

    log.info({
      event: "run ok",
      metadata: {
        isError,
        title: finalOutput?.title,
        acceptable: isFinalOutputAcceptable(finalRunState),
        ...telemetry,
      },
    });

    return {
      url: sandboxUrl,
      title: finalOutput?.title,
      files: finalRunState.filesWritten,
      summary: finalOutput?.summary,
      status: finalOutput?.status,
    };
  }
);

export const askAgentFunction = inngest.createFunction(
  { id: "askAgent" },
  { event: "askAgent/run" },
  async ({ event, step }) => {
    const log = createLogger({
      scope: "inngest:askAgent",
      bindings: {
        projectId: event.data.projectId as string,
        eventId: event.id,
      },
    });

    const plannerSpec = resolvePlannerModel();
    await step.run("log-run-start", async () => {
      log.info({
        event: "run start",
        metadata: {
          provider: plannerSpec.provider,
          model: plannerSpec.model,
        },
      });
    });

    const previousMessages = await loggedStep(
      log,
      step,
      "get-previous-messages",
      () => getPreviousMessages(event.data.projectId)
    );

    const messages: ModelMessage[] = [
      ...(previousMessages as ModelMessage[]),
      { role: "user", content: event.data.userPrompt as string },
    ];

    const response = await loggedStep(log, step, "ask-agent", async () => {
      try {
        const { text } = await generateText({
          model: createModelProvider(plannerSpec),
          system: ASK_AGENT_PROMPT,
          messages,
          maxOutputTokens: 4096,
          providerOptions: CACHE_PROVIDER_OPTIONS,
        });
        return {
          text,
          error: null as string | null,
          category: null as string | null,
        };
      } catch (err) {
        const classified = classifyProviderError(err);
        log.error({
          event: "generate failed",
          metadata: { err, category: classified.category },
        });
        return {
          text: "",
          error: classified.userMessage,
          category: classified.category,
        };
      }
    });

    await loggedStep(
      log,
      step,
      "save-result",
      () =>
        response.error
          ? prisma.message.create({
              data: {
                projectId: event.data.projectId,
                content: response.error,
                role: MessageRole.ASSISTANT,
                type: MessageType.ERROR,
                status: MessageStatus.ERROR,
                mode: MessageMode.ASK,
              },
            })
          : prisma.message.create({
              data: {
                projectId: event.data.projectId,
                content:
                  response.text ||
                  "I couldn't generate a response. Please try again.",
                role: MessageRole.ASSISTANT,
                type: response.text ? MessageType.RESULT : MessageType.ERROR,
                mode: MessageMode.ASK,
              },
            }),
      { hasError: !!response.error }
    );

    log.info({
      event: "run ok",
      metadata: {
        hasError: !!response.error,
        category: response.category,
        textLength: response.text.length,
      },
    });

    return { response };
  }
);
