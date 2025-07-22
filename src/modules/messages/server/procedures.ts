import { prisma } from "@/db";
import { inngest } from "@/inngest/client";
import { consumeCredits } from "@/lib/usage";
import { protectedProcedure, createTRPCRouter } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import z from "zod";

export const messagesRouter = createTRPCRouter({
  getMany: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1, { message: "Project ID is required." }),
      })
    )
    .query(async ({ input, ctx }) => {
      return prisma.message.findMany({
        where: {
          projectId: input.projectId,
          project: { userId: ctx.auth.userId },
        },
        include: { fragment: true },
        orderBy: { updatedAt: "asc" },
      });
    }),
  create: protectedProcedure
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
    .mutation(async ({ input: { userPrompt, projectId }, ctx }) => {
      const existingProject = await prisma.project.findUnique({
        where: { id: projectId, userId: ctx.auth.userId },
      });

      if (!existingProject) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Project with ID ${projectId} not found.`,
        });
      }

      try {
        await consumeCredits();
      } catch (error) {
        if (error instanceof Error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Something went wrong",
          });
        } else {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "You have run out of credits",
          });
        }
      }

      const createdMessage = await prisma.message.create({
        data: {
          projectId: existingProject.id,
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
