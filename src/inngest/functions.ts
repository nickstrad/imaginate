import { Agent, openai, createAgent } from "@inngest/agent-kit";
import { inngest } from "./client";

export const helloWorld = inngest.createFunction(
  { id: "helloWorld" },
  { event: "name/helloWorld" },
  async ({ event, step }) => {
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
    const message = output[0];

    return { message, output };
  }
);
