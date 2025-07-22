import { Message } from "@inngest/agent-kit";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const parseAgentOutput = (
  generatorOutput: Message[],
  defaultMessage: string
): string => {
  const output = generatorOutput[0];
  if (output.type !== "text") {
    return defaultMessage;
  }

  if (Array.isArray(output.content)) {
    return output.content.map((t) => t).join("");
  }

  return output.content;
};
