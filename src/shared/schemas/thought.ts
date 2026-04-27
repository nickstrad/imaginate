import { z } from "zod";

export const ThoughtToolCallSchema = z.object({
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()),
});

export const ThoughtSchema = z.object({
  stepIndex: z.number(),
  text: z.string(),
  toolCalls: z.array(ThoughtToolCallSchema).optional(),
  toolResults: z.array(z.string()).optional(),
  reasoningText: z.string().optional(),
  finishReason: z.string().optional(),
});

export const ThoughtsSchema = z.array(ThoughtSchema);

export type Thought = z.infer<typeof ThoughtSchema>;
export type ThoughtToolCall = z.infer<typeof ThoughtToolCallSchema>;
