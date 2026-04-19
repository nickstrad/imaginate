import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { Sandbox } from "@e2b/code-interpreter";
import { inngest } from "./client";
import { getSandbox, SANDBOX_TIMEOUT } from "./utils";
import {
  createModelProvider,
  resolveModelConfig,
  getPreviousMessages,
} from "./model-factory";
import {
  AGENT_PROMPT,
  FRAGMENT_TITLE_PROMPT,
  RESPONSE_PROMPT,
  ASK_AGENT_PROMPT,
} from "@/prompts/prompts";
import { prisma } from "@/db";

export const codeAgentFunction = inngest.createFunction(
  { id: "codeAgent" },
  { event: "codeAgent/run" },
  async ({ event, step }) => {
    const sandboxId = await step.run("get-sandbox-id", async () => {
      const sandbox = await Sandbox.create("imaginate-dev");
      await sandbox.setTimeout(SANDBOX_TIMEOUT);
      return sandbox.sandboxId;
    });

    const modelConfig = await step.run("get-model-config", async () =>
      resolveModelConfig(event.data.userId, event.data.selectedModels),
    );

    const previousMessages = await step.run("get-previous-messages", async () =>
      getPreviousMessages(event.data.projectId),
    );

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
        files: z.array(
          z.object({ path: z.string(), content: z.string() }),
        ),
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
          },
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
              })),
            );
            return JSON.stringify(contents);
          } catch (error) {
            console.error(error);
            return `Error: ${error}`;
          }
        }),
    });

    const result = await generateText({
      model: createModelProvider(
        modelConfig.provider,
        modelConfig.model,
        modelConfig.apiKey,
      ),
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
          return typeof last?.text === "string" && last.text.includes("<task_summary>");
        },
      ],
    });

    const summary = result.text?.includes("<task_summary>") ? result.text : "";

    const openaiForPostproc = createOpenAI({ apiKey: modelConfig.openaiApiKey });

    const fragmentTitle = await step.run("fragment-title", async () => {
      if (!summary) return "Fragment";
      const { text } = await generateText({
        model: openaiForPostproc("gpt-4o-mini"),
        system: FRAGMENT_TITLE_PROMPT,
        prompt: summary,
      });
      return text || "Fragment";
    });

    const responseText = await step.run("response-text", async () => {
      if (!summary) return "Here you go.";
      const { text } = await generateText({
        model: openaiForPostproc("gpt-4o-mini"),
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
        return prisma.message.create({
          data: {
            projectId: event.data.projectId,
            content: "Something went wrong. Please try again..",
            role: "ASSISTANT",
            type: "ERROR",
          },
        });
      }

      return prisma.message.create({
        data: {
          projectId: event.data.projectId,
          content: responseText,
          role: "ASSISTANT",
          type: "RESULT",
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
  },
);

export const askAgentFunction = inngest.createFunction(
  { id: "askAgent" },
  { event: "askAgent/run" },
  async ({ event, step }) => {
    const modelConfig = await step.run("get-model-config", async () =>
      resolveModelConfig(event.data.userId, event.data.selectedModels),
    );

    const previousMessages = await step.run("get-previous-messages", async () =>
      getPreviousMessages(event.data.projectId),
    );

    const messages: ModelMessage[] = [
      ...(previousMessages as ModelMessage[]),
      { role: "user", content: event.data.userPrompt as string },
    ];

    const response = await step.run("ask-agent", async () => {
      const { text } = await generateText({
        model: createModelProvider(
          modelConfig.provider,
          modelConfig.model,
          modelConfig.apiKey,
        ),
        system: ASK_AGENT_PROMPT,
        messages,
        maxOutputTokens: 4096,
      });
      return text;
    });

    await step.run("save-result", async () => {
      return prisma.message.create({
        data: {
          projectId: event.data.projectId,
          content: response || "I couldn't generate a response. Please try again.",
          role: "ASSISTANT",
          type: response ? "RESULT" : "ERROR",
          mode: "ASK",
        },
      });
    });

    return { response };
  },
);
