import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { Sandbox } from "@e2b/code-interpreter";
import { inngest } from "./client";
import { getSandbox, SANDBOX_TIMEOUT } from "./utils";
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

export const codeAgentFunction = inngest.createFunction(
  { id: "codeAgent" },
  { event: "codeAgent/run" },
  async ({ event, step }) => {
    const sandboxId = await step.run("get-sandbox-id", async () => {
      const sandbox = await Sandbox.create("imaginate-dev");
      await sandbox.setTimeout(SANDBOX_TIMEOUT);
      return sandbox.sandboxId;
    });

    const modelConfig = resolveModelConfig(event.data.selectedModels);

    const persistedMessage = await step.run("create-message", async () =>
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

    const previousMessages = await step.run("get-previous-messages", async () =>
      getPreviousMessages(event.data.projectId)
    );

    let thoughts: Thought[] = [];

    const messages: ModelMessage[] = [
      ...(previousMessages as ModelMessage[]),
      { role: "user", content: event.data.userPrompt as string },
    ];

    const filesState: Record<string, string> = {};
    let toolStepCounter = 0;
    const nextStepId = (base: string) => `${base}-${++toolStepCounter}`;

    const terminalTool = tool({
      description: "Use the terminal to run commands",
      inputSchema: z.object({ command: z.string() }),
      execute: async ({ command }) =>
        step.run(nextStepId("terminal"), async () => {
          const buffers = { stdout: "", stderr: "" };
          try {
            const sandbox = await getSandbox(sandboxId);
            const result = await sandbox.commands.run(command, {
              onStdout: (data) => {
                buffers.stdout += data;
              },
              onStderr: (data) => {
                buffers.stderr += data;
              },
            });
            return result.stdout;
          } catch (error) {
            const errMsg = `Command failed:\nerror: ${error}\nstdout: ${buffers.stdout}\nstderr: ${buffers.stderr}`;
            console.error(errMsg);
            return errMsg;
          }
        }),
    });

    const createOrUpdateFilesTool = tool({
      description: "Create or update files in the sandbox",
      inputSchema: z.object({
        files: z.array(z.object({ path: z.string(), content: z.string() })),
      }),
      execute: async ({ files }) => {
        const written = await step.run(
          nextStepId("createOrUpdateFiles"),
          async () => {
            try {
              const sandbox = await getSandbox(sandboxId);
              const out: Record<string, string> = {};
              for (const file of files) {
                await sandbox.files.write(file.path, file.content);
                out[file.path] = file.content;
              }
              return { ok: true as const, files: out };
            } catch (error) {
              return { ok: false as const, error: String(error) };
            }
          }
        );

        if (!written.ok) return `Error: ${written.error}`;
        Object.assign(filesState, written.files);
        return `Wrote ${Object.keys(written.files).length} file(s).`;
      },
    });

    const readFilesTool = tool({
      description: "Read files from the sandbox",
      inputSchema: z.object({ files: z.array(z.string()) }),
      execute: async ({ files }) =>
        step.run(nextStepId("readFiles"), async () => {
          try {
            const sandbox = await getSandbox(sandboxId);
            const contents = await Promise.all(
              files.map(async (file) => ({
                path: file,
                content: await sandbox.files.read(file),
              }))
            );
            return JSON.stringify(contents);
          } catch (error) {
            console.error(error);
            return `Error: ${error}`;
          }
        }),
    });

    let result;
    try {
      result = await generateText({
        model: createModelProvider(modelConfig),
        system: AGENT_PROMPT,
        messages,
        tools: {
          terminal: terminalTool,
          createOrUpdateFiles: createOrUpdateFilesTool,
          readFiles: readFilesTool,
        },
        maxOutputTokens: 4096,
        stopWhen: [
          stepCountIs(15),
          ({ steps }) => {
            const last = steps[steps.length - 1];
            return (
              typeof last?.text === "string" &&
              last.text.includes("<task_summary>")
            );
          },
        ],
        onStepFinish: async (stepResult) => {
          const newThought = ThoughtSchema.parse({
            stepIndex: stepResult.stepNumber,
            text: stepResult.text ?? "",
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

          await prisma.message.update({
            where: { id: persistedMessage.id },
            data: { thoughts: thoughtsToPrismaJson(thoughts) },
          });
        },
      });
    } catch (err) {
      const errorMessage = formatProviderError(err);
      await step.run("save-provider-error", async () =>
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

    const summary = result.text?.includes("<task_summary>") ? result.text : "";
    const postprocModel = resolvePostprocModel(modelConfig);

    const fragmentTitle = await step.run("fragment-title", async () => {
      if (!summary) return "Fragment";
      const { text } = await generateText({
        model: postprocModel,
        system: FRAGMENT_TITLE_PROMPT,
        prompt: summary,
      });
      return text || "Fragment";
    });

    const responseText = await step.run("response-text", async () => {
      if (!summary) return "Here you go.";
      const { text } = await generateText({
        model: postprocModel,
        system: RESPONSE_PROMPT,
        prompt: summary,
      });
      return text || "Here you go.";
    });

    const isError = !summary || !Object.keys(filesState).length;

    const sandboxUrl = await step.run("get-sandbox-url", async () => {
      const sandbox = await getSandbox(sandboxId);
      const host = sandbox.getHost(3000);
      return `https://${host}`;
    });

    await step.run("save-result", async () => {
      if (isError) {
        return prisma.message.update({
          where: { id: persistedMessage.id },
          data: {
            content: "Something went wrong. Please try again..",
            type: MessageType.ERROR,
            status: MessageStatus.ERROR,
          },
        });
      }

      return prisma.message.update({
        where: { id: persistedMessage.id },
        data: {
          content: responseText,
          type: MessageType.RESULT,
          status: MessageStatus.COMPLETE,
          fragment: {
            create: {
              sandboxUrl,
              title: fragmentTitle,
              files: filesState,
            },
          },
        },
      });
    });

    return {
      url: sandboxUrl,
      title: fragmentTitle,
      files: filesState,
      summary,
    };
  }
);

export const askAgentFunction = inngest.createFunction(
  { id: "askAgent" },
  { event: "askAgent/run" },
  async ({ event, step }) => {
    const modelConfig = resolveModelConfig(event.data.selectedModels);

    const previousMessages = await step.run("get-previous-messages", async () =>
      getPreviousMessages(event.data.projectId)
    );

    const messages: ModelMessage[] = [
      ...(previousMessages as ModelMessage[]),
      { role: "user", content: event.data.userPrompt as string },
    ];

    const response = await step.run("ask-agent", async () => {
      try {
        const { text } = await generateText({
          model: createModelProvider(modelConfig),
          system: ASK_AGENT_PROMPT,
          messages,
          maxOutputTokens: 4096,
        });
        return { text, error: null };
      } catch (err) {
        return { text: "", error: formatProviderError(err) };
      }
    });

    await step.run("save-result", async () => {
      if (response.error) {
        return prisma.message.create({
          data: {
            projectId: event.data.projectId,
            content: response.error,
            role: MessageRole.ASSISTANT,
            type: MessageType.ERROR,
            status: MessageStatus.ERROR,
            mode: MessageMode.ASK,
          },
        });
      }
      return prisma.message.create({
        data: {
          projectId: event.data.projectId,
          content:
            response.text ||
            "I couldn't generate a response. Please try again.",
          role: MessageRole.ASSISTANT,
          type: response.text ? MessageType.RESULT : MessageType.ERROR,
          mode: MessageMode.ASK,
        },
      });
    });

    return { response };
  }
);
