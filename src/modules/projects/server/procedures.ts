import { prisma } from "@/db";
import { publicProcedure, createTRPCRouter } from "@/trpc/init";
import z from "zod";
import { generateSlug } from "random-word-slugs";
import { inngest } from "@/inngest/client";
import { TRPCError } from "@trpc/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { MessageMode } from "@/generated/prisma";
import { SelectedModelsSchema } from "@/lib/providers";

const PROJECT_LIMIT = 50;

export const projectsRouter = createTRPCRouter({
  getOne: publicProcedure
    .input(
      z.object({
        id: z.string().min(1, { message: "Project ID is required." }),
      })
    )
    .query(async ({ input: { id } }) => {
      const existingProject = await prisma.project.findUnique({
        where: { id },
      });

      if (!existingProject) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Project with ID ${id} not found.`,
        });
      }

      return existingProject;
    }),
  getMany: publicProcedure.query(async () => {
    return prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      take: PROJECT_LIMIT,
    });
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
        selectedModels: SelectedModelsSchema.optional(),
        mode: z.enum(["code", "ask"]).default("code"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await consumeRateLimit(ctx.ip);

      const project = await prisma.project.create({
        data: {
          name: generateSlug(2, {
            format: "kebab",
          }),
          messages: {
            create: {
              content: input.userPrompt,
              role: "USER",
              type: "RESULT",
              mode: input.mode === "ask" ? MessageMode.ASK : MessageMode.CODE,
            },
          },
        },
      });

      // Single atomic statement: evict any project beyond the newest PROJECT_LIMIT
      // by updatedAt. Race-free and one round-trip vs. count/find/delete.
      await prisma.$executeRaw`
        DELETE FROM "Project"
        WHERE id IN (
          SELECT id FROM "Project"
          ORDER BY "updatedAt" DESC
          OFFSET ${PROJECT_LIMIT}
        )
      `;

      const eventName = input.mode === "ask" ? "askAgent/run" : "codeAgent/run";

      await inngest.send({
        name: eventName,
        data: {
          userPrompt: input.userPrompt,
          projectId: project.id,
          selectedModels: input.selectedModels || {},
        },
      });

      return project;
    }),
});
