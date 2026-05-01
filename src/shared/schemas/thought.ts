import { z } from "zod";

export const ThoughtToolCallSchema = z.object({
  callId: z.string(),
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()),
  completion: z
    .discriminatedUnion("ok", [
      z.object({
        ok: z.literal(true),
        durationMs: z.number().optional(),
        result: z.unknown(),
      }),
      z.object({
        ok: z.literal(false),
        durationMs: z.number().optional(),
        error: z.object({
          code: z.string(),
          category: z.string(),
          retryable: z.boolean(),
          message: z.string(),
        }),
      }),
    ])
    .optional(),
});

export const ThoughtSchema = z.object({
  stepIndex: z.number(),
  text: z.string(),
  toolCalls: z.array(ThoughtToolCallSchema).optional(),
  reasoningText: z.string().optional(),
  finishReason: z.string().optional(),
});

export const ThoughtsSchema = z.array(ThoughtSchema);

export type Thought = z.infer<typeof ThoughtSchema>;
export type ThoughtToolCall = z.infer<typeof ThoughtToolCallSchema>;
