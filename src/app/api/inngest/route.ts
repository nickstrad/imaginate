import { serve } from "inngest/next";
import { inngest } from "@/interfaces/inngest/client";
import {
  askAgentFunction,
  codeAgentFunction,
  renameProjectFunction,
} from "@/interfaces/inngest/functions";

// Create an API that serves zero functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [codeAgentFunction, askAgentFunction, renameProjectFunction],
});
