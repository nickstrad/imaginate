import { prisma } from "@/db";
import { inngest } from "@/inngest/client";
import { consumeRateLimit } from "@/lib/rate-limit";
import { publicProcedure, createTRPCRouter } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import z from "zod";
import { MessageMode } from "@/generated/prisma";
import { SelectedModelsSchema } from "@/lib/providers";
import type { Thought } from "@/lib/schemas/thought";

export const messagesRouter = createTRPCRouter({
  getMany: publicProcedure
    .input(
      z.object({
        projectId: z.string().min(1, { message: "Project ID is required." }),
      })
    )
    .query(async ({ input }) => {
      const messages = await prisma.message.findMany({
        where: { projectId: input.projectId },
        include: { fragment: true },
        orderBy: { updatedAt: "asc" },
      });
      return messages.map((msg) => ({
        ...msg,
        thoughts: (msg.thoughts as Thought[] | null) ?? undefined,
      }));
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
        selectedModels: SelectedModelsSchema.optional(),
        mode: z.enum(["code", "ask"]).default("code"),
      })
    )
    .mutation(
      async ({
        input: { userPrompt, projectId, selectedModels, mode },
        ctx,
      }) => {
        const existingProject = await prisma.project.findUnique({
          where: { id: projectId },
        });

        if (!existingProject) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Project with ID ${projectId} not found.`,
          });
        }

        await consumeRateLimit(ctx.ip);

        const [createdMessage] = await prisma.$transaction([
          prisma.message.create({
            data: {
              projectId: existingProject.id,
              content: userPrompt,
              role: "USER",
              type: "RESULT",
              mode: mode === "ask" ? MessageMode.ASK : MessageMode.CODE,
            },
          }),
          prisma.project.update({
            where: { id: existingProject.id },
            data: { updatedAt: new Date() },
          }),
        ]);

        const eventName = mode === "ask" ? "askAgent/run" : "codeAgent/run";

        await inngest.send({
          name: eventName,
          data: {
            userPrompt,
            projectId,
            selectedModels: selectedModels || {},
          },
        });

        return createdMessage;
      }
    ),
});
