import { Sandbox } from "@e2b/code-interpreter";
import { AgentResult, TextMessage } from "@inngest/agent-kit";

export const getSandbox = async (sandboxId: string) =>
  await Sandbox.connect(sandboxId);

export const lastAssistantTextMessageContent = (result: AgentResult) => {
  const lastAssistantTextMessageIndex = result.output.findLastIndex(
    (m) => m.role === "assistant"
  );

  const message = result.output[lastAssistantTextMessageIndex] as
    | TextMessage
    | undefined;

  return message?.content
    ? typeof message.content === "string"
      ? message.content
      : message.content.map((m) => m.text).join("")
    : undefined;
};
