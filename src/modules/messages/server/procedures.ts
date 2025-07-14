import { prisma } from "@/db";
import { inngest } from "@/inngest/client";
import { baseProcedure, createTRPCRouter } from "@/trpc/init";
import z from "zod";

export const messagesRouter = createTRPCRouter({
  getMany: baseProcedure.query(async () => {
    return prisma.message.findMany({
      orderBy: { updatedAt: "asc" },
    });
  }),
  create: baseProcedure
    .input(
      z.object({
        userPrompt: z
          .string()
          .min(1, { message: "Prompt cannot be empty." })
          .max(10000, {
            message: "Prompt is too long.",
          }),
        projectId: z.string().min(1, { message: "Project ID is required." }),
      })
    )
    .mutation(async ({ input: { userPrompt, projectId } }) => {
      const createdMessage = await prisma.message.create({
        data: {
          projectId,
          content: userPrompt,
          role: "USER",
          type: "RESULT",
        },
      });

      await inngest.send({
        name: "codeAgent/run",
        data: { userPrompt, projectId },
      });

      return createdMessage;
    }),
});
