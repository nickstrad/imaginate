import { TRPCError } from "@trpc/server";
import z from "zod";
import {
  createPrismaMessageRepository,
  createUserMessage,
  listMessages,
  MessageProjectNotFoundError,
} from "@/features/messages";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createTRPCRouter, publicProcedure } from "../init";
import { inngest } from "@/interfaces/inngest/client";
import { eventNameForMode } from "@/interfaces/inngest/events";

const messageRepository = createPrismaMessageRepository();

function toMessageError(err: unknown): never {
  if (err instanceof MessageProjectNotFoundError) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: err.message,
    });
  }
  throw err;
}

export const messagesRouter = createTRPCRouter({
  getMany: publicProcedure
    .input(
      z.object({
        projectId: z.string().min(1, { message: "Project ID is required." }),
      })
    )
    .query(async ({ input }) => {
      return listMessages(input, { repository: messageRepository });
    }),
  create: publicProcedure
    .input(
      z.object({
        userPrompt: z
          .string()
          .min(1, { message: "Prompt cannot be empty." })
          .max(10000, {
            message: "Prompt is too long.",
          }),
        projectId: z.string().min(1, { message: "Project ID is required." }),
        mode: z.enum(["code", "ask"]).default("code"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await consumeRateLimit(ctx.ip);

      try {
        const result = await createUserMessage(input, {
          repository: messageRepository,
        });

        await inngest.send({
          name: eventNameForMode(result.agentRun.mode),
          data: {
            userPrompt: result.agentRun.userPrompt,
            projectId: result.agentRun.projectId,
          },
        });

        return result.message;
      } catch (err) {
        toMessageError(err);
      }
    }),
});
