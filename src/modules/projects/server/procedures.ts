import { prisma } from "@/db";
import { publicProcedure, createTRPCRouter } from "@/trpc/init";
import z from "zod";
import { generateText } from "ai";
import { inngest } from "@/inngest/client";
import { TRPCError } from "@trpc/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { MessageMode } from "@/generated/prisma";
import { getProviderKey } from "@/lib/provider-config";
import { createModelProvider, MODEL_REGISTRY } from "@/inngest/model-factory";
import { eventNameForMode } from "@/inngest/events";
import { buildProjectName, placeholderName } from "./naming";

const PROJECT_LIMIT = 50;

const PROMPT_TRUNCATE_CHARS = 2000;

async function generateRawProjectName(
  userPrompt: string
): Promise<string | null> {
  const apiKey = getProviderKey(MODEL_REGISTRY.planner.provider);
  if (!apiKey) {
    return null;
  }
  try {
    const model = createModelProvider({ ...MODEL_REGISTRY.planner, apiKey });
    const { text } = await generateText({
      model,
      system:
        "You name software projects. Return a 2-5 word kebab-case name summarizing the user's project idea. No punctuation, no quotes, no explanation. Just the name.",
      prompt: userPrompt.slice(0, PROMPT_TRUNCATE_CHARS),
    });
    return text;
  } catch {
    return null;
  }
}

async function renameProjectInBackground(
  projectId: string,
  userPrompt: string
) {
  try {
    const raw = await generateRawProjectName(userPrompt);
    const name = buildProjectName(raw);
    if (!name) {
      return;
    }
    await prisma.project.update({ where: { id: projectId }, data: { name } });
  } catch {
    // swallow — placeholder name is acceptable
  }
}

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
        mode: z.enum(["code", "ask"]).default("code"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await consumeRateLimit(ctx.ip);

      const project = await prisma.project.create({
        data: {
          name: placeholderName(),
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

      await inngest.send({
        name: eventNameForMode(input.mode),
        data: {
          userPrompt: input.userPrompt,
          projectId: project.id,
        },
      });

      void renameProjectInBackground(project.id, input.userPrompt);

      return project;
    }),
});
