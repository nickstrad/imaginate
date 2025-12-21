import { prisma } from "@/db";
import { protectedProcedure, createTRPCRouter } from "@/trpc/init";
import z from "zod";
import { generateSlug } from "random-word-slugs";
import { inngest } from "@/inngest/client";
import { TRPCError } from "@trpc/server";
import { consumeCredits } from "@/lib/usage";

export const projectsRouter = createTRPCRouter({
  getOne: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1, { message: "Project ID is required." }),
      })
    )
    .query(async ({ input: { id }, ctx }) => {
      const existingProject = await prisma.project.findUnique({
        where: { id, userId: ctx.auth.userId },
      });

      if (!existingProject) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Project with ID ${id} not found.`,
        });
      }

      return existingProject;
    }),
  getMany: protectedProcedure.query(async ({ ctx }) => {
    return prisma.project.findMany({
      where: { userId: ctx.auth.userId },
      orderBy: { updatedAt: "desc" },
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
        selectedModels: z
          .object({
            openai: z.string().optional(),
            anthropic: z.string().optional(),
            gemini: z.string().optional(),
          })
          .optional(),
        mode: z.enum(["code", "ask"]).default("code"),
      })
    )
    .mutation(async ({ input, ctx }) => {
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

      const project = await prisma.project.create({
        data: {
          name: generateSlug(2, {
            format: "kebab",
          }),
          userId: ctx.auth.userId,
          messages: {
            create: {
              content: input.userPrompt,
              role: "USER",
              type: "RESULT",
              mode: input.mode.toUpperCase() as "CODE" | "ASK",
            },
          },
        },
      });

      const eventName = input.mode === "ask" ? "askAgent/run" : "codeAgent/run";

      await inngest.send({
        name: eventName,
        data: {
          userPrompt: input.userPrompt,
          projectId: project.id,
          userId: ctx.auth.userId,
          selectedModels: input.selectedModels || {},
        },
      });

      return project;
    }),
});
