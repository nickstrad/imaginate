import { inngest } from "./client";

export const helloWorld = inngest.createFunction(
  { id: "helloWorld" },
  { event: "name/helloWorld" },
  async ({ event, step }) => {
    await step.sleep("wait-a-moment", "1s"); // Simulate some processing time

    await step.sleep("wait-a-moment-2", "3s"); // Simulate some processing time

    await step.sleep("wait-a-moment-3", "5s"); // Simulate some processing time

    return { message: `Hello ${event.data.email}!` };
  }
);
