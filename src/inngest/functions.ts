import { Agent, openai, createAgent } from "@inngest/agent-kit";
import { inngest } from "./client";
import { Sandbox } from "@e2b/code-interpreter";
import { getSandbox } from "./utils";

export const helloWorld = inngest.createFunction(
  { id: "helloWorld" },
  { event: "name/helloWorld" },
  async ({ event, step }) => {
    const sandboxId = await step.run("get-sandbox-id", async () => {
      const sandbox = await Sandbox.create("imaginate-dev");
      return sandbox.sandboxId;
    });

    const codeAgent = createAgent({
      model: openai({
        model: "gpt-4.1",
        // apiKey: process.env.OPENAI_API_KEY
      }),
      system:
        "You are an expert next.js developer. You write readable, maintainable code. You write simple next.js and React snippets.",
      name: "writer",
    });

    const { output } = await codeAgent.run(
      `Write the following snippet: \n${event.data.message}`
    );

    const sandboxUrl = await step.run("get-sandbox-url", async () => {
      const sandbox = await getSandbox(sandboxId);
      const host = sandbox.getHost(3000);

      return `https://${host}`;
    });

    return { output, sandboxUrl };
  }
);
