import { generateText, type ModelMessage } from "ai";
import { Sandbox } from "@e2b/code-interpreter";
import { inngest } from "./client";
import { getSandbox, SANDBOX_TIMEOUT } from "./utils";
import { AGENT_CONFIG, createRunState } from "./agent-config";
import {
  computeIsError,
  createCreateFilesTool,
  createListFilesTool,
  createReadFilesTool,
  createReplaceInFileTool,
  createTerminalTool,
} from "./agent-tools";
import {
  buildTelemetry,
  extractTelemetry,
  persistTelemetry,
  readUsage,
} from "./agent-telemetry";
import { createLogger, timed, type Logger } from "@/lib/log";
import {
  createModelProvider,
  resolveModelConfig,
  resolvePostprocModel,
  getPreviousMessages,
} from "./model-factory";
import {
  AGENT_PROMPT,
  FRAGMENT_TITLE_PROMPT,
  RESPONSE_PROMPT,
  ASK_AGENT_PROMPT,
} from "@/prompts/prompts";
import { prisma } from "@/db";
import {
  MessageRole,
  MessageType,
  MessageStatus,
  MessageMode,
} from "@/generated/prisma";
import {
  ThoughtSchema,
  ThoughtsSchema,
  thoughtsToPrismaJson,
  type Thought,
} from "@/lib/schemas/thought";

function formatProviderError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : JSON.stringify(err);

  const lower = raw.toLowerCase();

  if (
    lower.includes("credit") ||
    lower.includes("balance") ||
    lower.includes("quota") ||
    lower.includes("insufficient")
  ) {
    return `Provider account limit reached: ${raw}`;
  }
  if (
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("too many requests")
  ) {
    return `Provider rate limit exceeded: ${raw}`;
  }
  if (
    lower.includes("unauthorized") ||
    lower.includes("401") ||
    lower.includes("api key") ||
    lower.includes("authentication")
  ) {
    return `Provider authentication failed: ${raw}`;
  }
  if (
    lower.includes("timeout") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout")
  ) {
    return `Provider connection error: ${raw}`;
  }
  return `Provider error: ${raw}`;
}

function stepTextOf(src: unknown): string {
  if (!src || typeof src !== "object") return "";
  const s = src as { text?: unknown; content?: unknown };
  if (typeof s.text === "string" && s.text) return s.text;
  const parts = Array.isArray(s.content) ? s.content : [];
  let out = "";
  for (const p of parts) {
    if (p && typeof p === "object") {
      const part = p as { type?: unknown; text?: unknown };
      if (part.type === "text" && typeof part.text === "string") {
        out += part.text;
      }
    }
  }
  return out;
}

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
    const modelConfig = resolveModelConfig(event.data.selectedModels);
    await step.run("log-run-start", async () => {
      log.info({ event: "run start" });
      log.info({
        event: "model resolved",
        metadata: {
          provider: modelConfig.provider,
          model: modelConfig.model,
        },
      });
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

    let thoughts: Thought[] = [];
    const cumulativeUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    const messages: ModelMessage[] = [
      ...(previousMessages as ModelMessage[]),
      { role: "user", content: event.data.userPrompt as string },
    ];

    const sandboxId = await loggedStep(
      log,
      step,
      "get-sandbox-id",
      async () => {
        const sandbox = await Sandbox.create("imaginate-dev");
        await sandbox.setTimeout(SANDBOX_TIMEOUT);
        return sandbox.sandboxId;
      }
    );

    const runState = createRunState();
    const toolDeps = { sandboxId, runState };

    log.info({
      event: "generate start",
      metadata: {
        maxSteps: AGENT_CONFIG.maxSteps,
        maxOutputTokens: AGENT_CONFIG.maxOutputTokens,
        previousMessageCount: previousMessages.length,
      },
    });
    const generateStart = Date.now();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;
    try {
      result = await loggedStep(log, step, "agent-generate", () =>
        generateText({
          model: createModelProvider(modelConfig),
          system: AGENT_PROMPT,
          messages,
          tools: {
            terminal: createTerminalTool(toolDeps),
            createFiles: createCreateFilesTool(toolDeps),
            readFiles: createReadFilesTool(toolDeps),
            replaceInFile: createReplaceInFileTool(toolDeps),
            listFiles: createListFilesTool(toolDeps),
          },
          maxOutputTokens: AGENT_CONFIG.maxOutputTokens,
          stopWhen: [
            ({ steps }) => {
              if (AGENT_CONFIG.maxSteps === undefined) return false;
              const billable = steps.filter((s) => {
                const calls = s.toolCalls ?? [];
                if (calls.length === 0) return true;
                return calls.some(
                  (tc) =>
                    tc.toolName !== "readFiles" && tc.toolName !== "listFiles"
                );
              }).length;
              return billable >= AGENT_CONFIG.maxSteps;
            },
          ],
          onStepFinish: async (stepResult) => {
            const summarizeArgs = (input: unknown): unknown => {
              if (input == null || typeof input !== "object") return input;
              const obj = input as Record<string, unknown>;
              const out: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(obj)) {
                if (Array.isArray(v)) {
                  out[k] = v.map((item) => {
                    if (item && typeof item === "object" && "content" in item) {
                      const { content, ...rest } = item as Record<
                        string,
                        unknown
                      >;
                      const c = typeof content === "string" ? content : "";
                      return { ...rest, contentChars: c.length };
                    }
                    return item;
                  });
                } else if (typeof v === "string" && v.length > 200) {
                  out[k] = v.slice(0, 200) + `…(+${v.length - 200} chars)`;
                } else {
                  out[k] = v;
                }
              }
              return out;
            };

            const summarizeResult = (output: unknown): unknown => {
              if (typeof output === "string") {
                return output.length > 300
                  ? output.slice(0, 300) + `…(+${output.length - 300} chars)`
                  : output;
              }
              if (output && typeof output === "object") {
                const o = output as Record<string, unknown>;
                const r: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(o)) {
                  if (typeof v === "string" && v.length > 300) {
                    r[k] = v.slice(0, 300) + `…(+${v.length - 300} chars)`;
                  } else {
                    r[k] = v;
                  }
                }
                return r;
              }
              return output;
            };

            const toolCalls =
              stepResult.toolCalls?.map((tc) => ({
                name: tc.toolName,
                args: summarizeArgs(tc.input),
              })) ?? [];
            const toolResults =
              stepResult.toolResults?.map((tr) => ({
                name: tr.toolName,
                result: summarizeResult(tr.output),
              })) ?? [];

            const stepText = stepTextOf(stepResult);

            log.info({
              event: "agent step",
              metadata: {
                stepIndex: stepResult.stepNumber,
                finishReason: stepResult.finishReason,
                text:
                  stepText.length > 300
                    ? stepText.slice(0, 300) + "…"
                    : stepText,
                reasoning: stepResult.reasoning?.[0]?.text?.slice(0, 300),
                toolCalls,
                toolResults,
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

            const stepUsage = readUsage(stepResult.usage);
            cumulativeUsage.promptTokens += stepUsage.promptTokens;
            cumulativeUsage.completionTokens += stepUsage.completionTokens;
            cumulativeUsage.totalTokens += stepUsage.totalTokens;

            const stepsCompleted = stepResult.stepNumber + 1;
            await Promise.all([
              prisma.message.update({
                where: { id: persistedMessage.id },
                data: { thoughts: thoughtsToPrismaJson(thoughts) },
              }),
              persistTelemetry(
                persistedMessage.id,
                buildTelemetry(runState, stepsCompleted, cumulativeUsage)
              ).catch((e) =>
                log.warn({
                  event: "telemetry snapshot failed",
                  metadata: { err: String(e) },
                })
              ),
            ]);
          },
        })
      );
    } catch (err) {
      const errorMessage = formatProviderError(err);
      log.error({
        event: "generate failed",
        metadata: { err, ms: Date.now() - generateStart },
      });
      await loggedStep(log, step, "save-provider-error", () =>
        prisma.message.update({
          where: { id: persistedMessage.id },
          data: {
            content: errorMessage,
            type: MessageType.ERROR,
            status: MessageStatus.ERROR,
          },
        })
      );
      return { error: errorMessage };
    }

    const extractSummary = (): string => {
      const SUMMARY_RE = /<task_summary>[\s\S]*?<\/task_summary>/;
      function* candidates() {
        yield stepTextOf(result);
        for (const s of result.steps ?? []) yield stepTextOf(s);
        for (const t of thoughts) if (t.text) yield t.text;
      }
      let openTagFallback = "";
      for (const text of candidates()) {
        if (!text) continue;
        const m = text.match(SUMMARY_RE);
        if (m) return m[0];
        if (!openTagFallback && text.includes("<task_summary>")) {
          openTagFallback = text;
        }
      }
      if (!openTagFallback) log.warn({ event: "extract summary: no match" });
      return openTagFallback;
    };
    const summary = extractSummary();
    log.info({
      event: "generate ok",
      metadata: {
        ms: Date.now() - generateStart,
        steps: result.steps?.length ?? 0,
        hasSummary: !!summary,
        filesWritten: Object.keys(runState.filesWritten).length,
        buildSucceeded: runState.buildSucceeded,
      },
    });

    const postprocModel = resolvePostprocModel(modelConfig);

    const [fragmentTitle, responseText, sandboxUrl] = await Promise.all([
      loggedStep(log, step, "fragment-title", async () => {
        if (!summary) return "Fragment";
        const { text } = await generateText({
          model: postprocModel,
          system: FRAGMENT_TITLE_PROMPT,
          prompt: summary,
          maxOutputTokens: 32,
        });
        return text || "Fragment";
      }),
      loggedStep(log, step, "response-text", async () => {
        if (!summary) return "Here you go.";
        const { text } = await generateText({
          model: postprocModel,
          system: RESPONSE_PROMPT,
          prompt: summary,
          maxOutputTokens: 160,
        });
        return text || "Here you go.";
      }),
      loggedStep(log, step, "get-sandbox-url", async () => {
        const sandbox = await getSandbox(sandboxId);
        return `https://${sandbox.getHost(3000)}`;
      }),
    ]);

    const isError = computeIsError(runState, summary);
    log.info({
      event: "outcome",
      metadata: { isError, hasSummary: !!summary },
    });

    await loggedStep(
      log,
      step,
      "save-result",
      () =>
        isError
          ? prisma.message.update({
              where: { id: persistedMessage.id },
              data: {
                content: "Something went wrong. Please try again..",
                type: MessageType.ERROR,
                status: MessageStatus.ERROR,
              },
            })
          : prisma.message.update({
              where: { id: persistedMessage.id },
              data: {
                content: responseText,
                type: MessageType.RESULT,
                status: MessageStatus.COMPLETE,
                fragment: {
                  create: {
                    sandboxUrl,
                    title: fragmentTitle,
                    files: runState.filesWritten,
                  },
                },
              },
            }),
      { isError }
    );

    const telemetry = extractTelemetry(result, runState);
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
        fragmentTitle,
        ...telemetry,
      },
    });

    return {
      url: sandboxUrl,
      title: fragmentTitle,
      files: runState.filesWritten,
      summary,
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
    const modelConfig = resolveModelConfig(event.data.selectedModels);
    await step.run("log-run-start", async () => {
      log.info({ event: "run start" });
      log.info({
        event: "model resolved",
        metadata: { provider: modelConfig.provider, model: modelConfig.model },
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
          model: createModelProvider(modelConfig),
          system: ASK_AGENT_PROMPT,
          messages,
          maxOutputTokens: 4096,
        });
        return { text, error: null };
      } catch (err) {
        log.error({ event: "generate failed", metadata: { err } });
        return { text: "", error: formatProviderError(err) };
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
        textLength: response.text.length,
      },
    });

    return { response };
  }
);
