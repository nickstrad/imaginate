import { prisma } from "@/db";
import { baseProcedure, createTRPCRouter } from "@/trpc/init";
import z from "zod";
import { generateSlug } from "random-word-slugs";
import { inngest } from "@/inngest/client";

export const projectsRouter = createTRPCRouter({
  getMany: baseProcedure.query(async () => {
    return prisma.project.findMany({
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
      })
    )
    .mutation(async ({ input: { userPrompt } }) => {
      const project = await prisma.project.create({
        data: {
          name: generateSlug(2, {
            format: "kebab",
          }),
          messages: {
            create: {
              content: userPrompt,
              role: "USER",
              type: "RESULT",
            },
          },
        },
      });

      await inngest.send({
        name: "codeAgent/run",
        data: { userPrompt, projectId: project.id },
      });

      return project;
    }),
});
