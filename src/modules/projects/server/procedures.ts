import { prisma } from "@/db";
import { publicProcedure, createTRPCRouter } from "@/trpc/init";
import z from "zod";
import { generateSlug } from "random-word-slugs";
import { generateText } from "ai";
import { inngest } from "@/inngest/client";
import { TRPCError } from "@trpc/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { MessageMode } from "@/generated/prisma";
import { SelectedModelsSchema, type Provider } from "@/lib/providers";
import { getProviderKey } from "@/lib/provider-config";
import { createModelProvider } from "@/inngest/model-factory";

const PROJECT_LIMIT = 50;

const NAMER_CANDIDATES: ReadonlyArray<{ provider: Provider; model: string }> = [
  { provider: "openai", model: "gpt-5-nano" },
  { provider: "anthropic", model: "claude-haiku-4-5" },
  { provider: "gemini", model: "gemini-2.5-flash-lite" },
];

const PROMPT_TRUNCATE_CHARS = 2000;

function sanitizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
}

async function generateProjectName(userPrompt: string): Promise<string> {
  for (const candidate of NAMER_CANDIDATES) {
    const apiKey = getProviderKey(candidate.provider);
    if (!apiKey) continue;
    try {
      const model = createModelProvider({ ...candidate, apiKey });
      const { text } = await generateText({
        model,
        system:
          "You name software projects. Return a 2-5 word kebab-case name summarizing the user's project idea. No punctuation, no quotes, no explanation. Just the name.",
        prompt: userPrompt.slice(0, PROMPT_TRUNCATE_CHARS),
      });
      const name = sanitizeName(text);
      if (name.length >= 2) return name;
    } catch {
      // fall through to next candidate
    }
  }
  return generateSlug(2, { format: "kebab" });
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
        selectedModels: SelectedModelsSchema.optional(),
        mode: z.enum(["code", "ask"]).default("code"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await consumeRateLimit(ctx.ip);

      const name = await generateProjectName(input.userPrompt);

      const project = await prisma.project.create({
        data: {
          name,
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
