import { generateText, type ModelMessage } from "ai";
import { Sandbox } from "@e2b/code-interpreter";
import {
  buildAgentDeps,
  logAgentRuntimeEvent,
  makePersistedThoughtSink,
} from "./agent-adapter";
import { inngest } from "./client";
import {
  ensurePreviewReady,
  getSandbox,
  getSandboxUrl,
  SANDBOX_DEFAULT_TIMEOUT_MS,
} from "@/platform/sandbox";
import {
  agentErrorMessage,
  buildTelemetry,
  classifyAgentError,
  createRunState,
  executeRun,
  persistTelemetryWith,
  planRun,
  type AgentError,
  type FinalOutput,
  type Thought,
  type UsageTotals,
} from "@/agent";
import {
  createLogger,
  openRunFileSink,
  timed,
  type Logger,
} from "@/platform/log";
import {
  createModelProvider,
  getPreviousMessages,
  resolvePlannerModel,
} from "@/platform/models";
import {
  buildExecutorSystemPrompt,
  CACHE_PROVIDER_OPTIONS,
  getAgentPrompts,
} from "@/shared/prompts";
import {
  createMessageWorkflow,
  createPrismaMessageRepository,
} from "@/features/messages";
import {
  createAiProjectNameGenerator,
  createPrismaProjectRepository,
  createProjectWorkflow,
} from "@/features/projects";
import { EVENT_NAMES } from "./events";

type StepCtx = {
  run: (id: string, fn: () => Promise<unknown>) => Promise<unknown>;
};

type RuntimeErrorState = {
  cause: unknown;
  error: AgentError;
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

const messageWorkflow = createMessageWorkflow({
  repository: createPrismaMessageRepository(),
});
const projectWorkflow = createProjectWorkflow({
  repository: createPrismaProjectRepository(),
  nameGenerator: createAiProjectNameGenerator(),
});
const prompts = getAgentPrompts();

export const codeAgentFunction = inngest.createFunction(
  { id: "codeAgent" },
  { event: "codeAgent/run" },
  async ({ event, step }) => {
    const projectId = event.data.projectId as string;
    const boundaryLog = createLogger({
      scope: "inngest:codeAgent",
      bindings: {
        projectId,
        eventId: event.id,
      },
    });

    await step.run("log-run-start", async () => {
      boundaryLog.info({ event: "run start" });
    });

    // Stable across Inngest replays — `Date.now()` would mint a new file per
    // retry. `event.id` is unique per logical run.
    const runId = `${projectId}-${event.id}`;
    const fileSink = openRunFileSink({ runId });
    const log = boundaryLog.child({
      scope: "run",
      bindings: { runId },
    });

    try {
      const persistedMessage = await loggedStep(
        log,
        step,
        "create-message",
        () => messageWorkflow.createPendingCodeMessage({ projectId })
      );

      const previousMessages = await loggedStep(
        log,
        step,
        "get-previous-messages",
        () => getPreviousMessages(projectId)
      );

      const userPrompt = event.data.userPrompt as string;
      const runState = createRunState();
      const thoughts: Thought[] = [];
      const cumulativeUsage: UsageTotals = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };

      // Build deps without a sandbox first; the sandbox is created lazily when
      // the executor needs it, but we know the sandbox id ahead of executor.
      const plannerDeps = buildAgentDeps({
        sandboxId: "unused-during-planning",
        log,
        emit: async (e) => {
          logAgentRuntimeEvent(log, e);
        },
      });

      const portMessages = (previousMessages as ModelMessage[]).map((m) => ({
        role: m.role as "system" | "user" | "assistant" | "tool",
        content:
          typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      }));

      const plan = await loggedStep(log, step, "plan", () =>
        planRun({
          input: {
            userPrompt,
            previousMessages: portMessages,
            plannerSystemPrompt: prompts.planner,
            providerCacheOptions: CACHE_PROVIDER_OPTIONS,
          },
          deps: plannerDeps,
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
          messageWorkflow.saveAnswerOnly({
            messageId: persistedMessage.id,
            answer,
          })
        );
        const telemetry = buildTelemetry(runState, 0, cumulativeUsage);
        await loggedStep(
          log,
          step,
          "save-telemetry",
          () =>
            persistTelemetryWith(
              plannerDeps.telemetryStore,
              persistedMessage.id,
              telemetry
            ),
          { ...telemetry } as Record<string, unknown>
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

      const persistedEmit = makePersistedThoughtSink({
        log,
        persistedMessageId: persistedMessage.id,
        thoughts,
        messageWorkflow,
      });

      const execDeps = buildAgentDeps({
        sandboxId,
        log,
        emit: persistedEmit,
      });

      let stepsCount = 0;
      let runtimeError: RuntimeErrorState | undefined;
      const escalations: Array<{
        attempt: number;
        model: string;
        reason?: string;
      }> = [];
      const ladder = execDeps.modelGateway.listExecutorModelIds();

      const executeOutcome = await loggedStep(
        log,
        step,
        "execute",
        async () => {
          for (let i = 0; i < ladder.length; i++) {
            const modelId = ladder[i];
            let descriptorString: string;
            try {
              const desc = execDeps.modelGateway.describeModel(modelId);
              descriptorString = `${desc.provider}:${desc.model}`;
            } catch (err) {
              log.warn({
                event: "ladder slot unavailable",
                metadata: { modelId, err: String(err) },
              });
              runtimeError = { cause: err, error: classifyAgentError(err) };
              continue;
            }

            await execDeps.eventSink.emit({
              type: "executor.attempt.started" as const,
              attempt: i + 1,
              model: descriptorString,
            });

            const outcome = await executeRun({
              input: {
                userPrompt,
                previousMessages: portMessages,
                plan,
                runState,
                thoughts,
                cumulativeUsage,
                buildExecutorSystemPrompt,
                providerCacheOptions: CACHE_PROVIDER_OPTIONS,
                modelId,
              },
              deps: {
                modelGateway: execDeps.modelGateway,
                sandboxGateway: execDeps.sandboxGateway,
                toolFactory: execDeps.toolFactory,
                eventSink: execDeps.eventSink,
                logger: execDeps.logger,
                persistTelemetrySnapshot: async (payload) => {
                  await persistTelemetryWith(
                    execDeps.telemetryStore,
                    persistedMessage.id,
                    payload
                  );
                },
              },
            });
            stepsCount = outcome.stepsCount;

            if (outcome.error) {
              const error = execDeps.modelGateway.classifyError(outcome.error);
              runtimeError = { cause: outcome.error, error };
              log.warn({
                event: "executor attempt failed",
                metadata: {
                  attempt: i + 1,
                  model: descriptorString,
                  category: error.category,
                  code: error.code,
                  retryable: error.retryable,
                  errorMessage: error.message,
                  rawError: agentErrorMessage(outcome.error),
                },
              });
              await execDeps.eventSink.emit({
                type: "executor.attempt.failed" as const,
                attempt: i + 1,
                error,
                category: error.category,
                retryable: error.retryable,
                errorMessage: error.message,
              });
              if (!error.retryable) {
                break;
              }
              continue;
            }

            runtimeError = undefined;

            if (!outcome.escalated) {
              await execDeps.eventSink.emit({
                type: "executor.accepted" as const,
                attempt: i + 1,
              });
              break;
            }

            escalations.push({
              attempt: i + 1,
              model: descriptorString,
              reason: outcome.reason,
            });
            log.warn({
              event: "executor escalated",
              metadata: {
                attempt: i + 1,
                model: descriptorString,
                reason: outcome.reason ?? null,
                hasFinalOutput: runState.finalOutput !== undefined,
                finalStatus: runState.finalOutput?.status,
              },
            });
            if (outcome.reason === "stub_language") {
              const lastText = thoughts[thoughts.length - 1]?.text ?? "";
              const lower = lastText.toLowerCase();
              const terms = ["todo", "placeholder", "not implemented"];
              for (const term of terms) {
                const idx = lower.indexOf(term);
                if (idx === -1) {
                  continue;
                }
                const start = Math.max(0, idx - 80);
                const end = Math.min(lastText.length, idx + term.length + 80);
                log.warn({
                  event: "stub language match",
                  metadata: {
                    attempt: i + 1,
                    term,
                    offset: idx,
                    window: lastText.slice(start, end),
                  },
                });
                break;
              }
            }
            await execDeps.eventSink.emit({
              type: "executor.escalated" as const,
              attempt: i + 1,
              reason: outcome.reason,
            });
          }

          const error = runtimeError?.error;
          const lastErrorMessage = runtimeError
            ? agentErrorMessage(runtimeError.cause)
            : null;

          if (!runState.finalOutput && !error && escalations.length > 0) {
            log.warn({
              event: "executor ladder exhausted via escalation",
              metadata: {
                ladderSize: ladder.length,
                escalations,
                stepsCount,
              },
            });
          }

          await execDeps.eventSink.emit({
            type: "agent.finished" as const,
            stepsCount,
            usage: cumulativeUsage,
            finalOutput: runState.finalOutput,
            error,
            lastErrorMessage,
          });

          return {
            runState,
            stepsCount,
            usage: cumulativeUsage,
            error,
            lastErrorMessage,
            escalations,
          };
        }
      );

      const finalRunState = executeOutcome.runState;
      const finalOutput: FinalOutput | undefined = finalRunState.finalOutput;
      const terminalError = executeOutcome.error;

      if (terminalError && !finalOutput) {
        log.warn({
          event: "executor exhausted with provider error",
          metadata: {
            category: terminalError.category,
            code: terminalError.code,
            rawError: terminalError.message,
          },
        });
        await loggedStep(log, step, "save-provider-error", () =>
          messageWorkflow.saveProviderError({
            messageId: persistedMessage.id,
            message: terminalError.message,
          })
        );
        return {
          error: terminalError.message,
          category: terminalError.category,
        };
      }

      const isError = !finalOutput || finalOutput.status === "failed";

      if (isError) {
        log.warn({
          event: "run failed",
          metadata: {
            finalStatus: finalOutput?.status,
            finalSummary: finalOutput?.summary,
            stepsCount: executeOutcome.stepsCount,
            terminalErrorCategory: terminalError?.category,
            terminalErrorCode: terminalError?.code,
            terminalErrorMessage: terminalError?.message,
            lastErrorMessage: executeOutcome.lastErrorMessage,
            escalations: executeOutcome.escalations,
          },
        });
      }

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
            ? messageWorkflow.failCodeMessage({
                messageId: persistedMessage.id,
                summary:
                  finalOutput?.summary ??
                  "Something went wrong. Please try again..",
              })
            : messageWorkflow.completeCodeMessage({
                messageId: persistedMessage.id,
                summary: finalOutput!.summary,
                title: finalOutput!.title,
                sandboxUrl,
                files: finalRunState.filesWritten,
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
        () =>
          persistTelemetryWith(
            execDeps.telemetryStore,
            persistedMessage.id,
            telemetry
          ),
        { ...telemetry } as Record<string, unknown>
      );

      log.info({
        event: "run ok",
        metadata: {
          isError,
          title: finalOutput?.title,
          acceptable:
            finalOutput !== undefined && finalOutput.status !== "failed",
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
    } finally {
      await fileSink.close();
    }
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
          system: prompts.ask,
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
        const classified = classifyAgentError(err);
        log.error({
          event: "generate failed",
          metadata: { err, category: classified.category },
        });
        return {
          text: "",
          error: classified.message,
          category: classified.category,
        };
      }
    });

    await loggedStep(
      log,
      step,
      "save-result",
      () =>
        messageWorkflow.createAskMessage(
          response.error
            ? {
                projectId: event.data.projectId,
                content: response.error,
                type: "ERROR",
              }
            : {
                projectId: event.data.projectId,
                content:
                  response.text ||
                  "I couldn't generate a response. Please try again.",
                type: response.text ? "RESULT" : "ERROR",
              }
        ),
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

export const renameProjectFunction = inngest.createFunction(
  { id: "renameProject" },
  { event: EVENT_NAMES.projectRename },
  async ({ event, step }) => {
    const log = createLogger({
      scope: "inngest:renameProject",
      bindings: {
        projectId: event.data.projectId,
        eventId: event.id,
      },
    });

    const result = await loggedStep(log, step, "rename-project", () =>
      projectWorkflow.renameFromPrompt({
        projectId: event.data.projectId,
        userPrompt: event.data.userPrompt,
      })
    );

    log.info({
      event: "run ok",
      metadata: result,
    });

    return result;
  }
);
