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
  buildTelemetry,
  createRunState,
  isFinalOutputAcceptable,
  persistTelemetry,
  runCodingAgentWithEscalation,
  runPlanner,
  AgentRuntimeEventType,
  type AgentRuntimeHooks,
  type FinalOutput,
} from "@/lib/agents";
import { createLogger, timed, type Logger } from "@/lib/log";
import {
  createModelProvider,
  getPreviousMessages,
  resolvePlannerModel,
} from "@/lib/models";
import { ASK_AGENT_PROMPT, CACHE_PROVIDER_OPTIONS } from "@/lib/prompts";
import { classifyProviderError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import {
  MessageRole,
  MessageType,
  MessageStatus,
  MessageMode,
} from "@/generated/prisma";
import { thoughtsToPrismaJson, type Thought } from "@/lib/schemas/thought";

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

function buildAgentHooks(args: {
  sandboxId: string;
  persistedMessageId: string;
  thoughts: Thought[];
  log: Logger;
}): AgentRuntimeHooks {
  const { sandboxId, persistedMessageId, thoughts, log } = args;
  return {
    getSandbox: () => getSandbox(sandboxId),
    persistTelemetry: async (payload) => {
      await persistTelemetry(persistedMessageId, payload);
    },
    emit: async (event) => {
      if (event.type === AgentRuntimeEventType.ExecutorStepFinished) {
        await prisma.message.update({
          where: { id: persistedMessageId },
          data: { thoughts: thoughtsToPrismaJson(thoughts) },
        });
        return;
      }
      if (event.type === AgentRuntimeEventType.ExecutorAttemptStarted) {
        log.info({
          event: "executor attempt",
          metadata: { attempt: event.attempt, model: event.model },
        });
      }
    },
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
        thoughts,
        cumulativeUsage,
        plan,
        runState,
        previousMessages: previousMessages as ModelMessage[],
        userPrompt,
        log,
        hooks: buildAgentHooks({
          sandboxId,
          persistedMessageId: persistedMessage.id,
          thoughts,
          log,
        }),
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
