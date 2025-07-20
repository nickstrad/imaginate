import { prisma } from "@/db";
import { protectedProcedure, createTRPCRouter } from "@/trpc/init";
import z from "zod";
import { generateSlug } from "random-word-slugs";
import { inngest } from "@/inngest/client";
import { TRPCError } from "@trpc/server";

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
      })
    )
    .mutation(async ({ input, ctx }) => {
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
            },
          },
        },
      });

      await inngest.send({
        name: "codeAgent/run",
        data: { userPrompt: input.userPrompt, projectId: project.id },
      });

      return project;
    }),
});
