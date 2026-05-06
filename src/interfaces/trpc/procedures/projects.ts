import { TRPCError } from "@trpc/server";
import z from "zod";
import {
  createAiProjectNameGenerator,
  createPrismaProjectRepository,
  createProjectWorkflow,
  ProjectNotFoundError,
} from "@/features/projects";
import { consumeRateLimit } from "@/platform/rate-limit";
import { createTRPCRouter, publicProcedure } from "../init";
import { inngest } from "@/interfaces/inngest/client";
import { EVENT_NAMES, eventNameForMode } from "@/interfaces/inngest/events";

const projectWorkflow = createProjectWorkflow({
  repository: createPrismaProjectRepository(),
  nameGenerator: createAiProjectNameGenerator(),
});

function toProjectError(err: unknown): never {
  if (err instanceof ProjectNotFoundError) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: err.message,
    });
  }
  throw err;
}

export const projectsRouter = createTRPCRouter({
  getOne: publicProcedure
    .input(
      z.object({
        id: z.string().min(1, { message: "Project ID is required." }),
      })
    )
    .query(async ({ input }) => {
      try {
        return await projectWorkflow.get(input);
      } catch (err) {
        toProjectError(err);
      }
    }),
  getMany: publicProcedure.query(async () => {
    return projectWorkflow.list();
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

      const result = await projectWorkflow.create(input);

      await inngest.send({
        name: eventNameForMode(result.agentRun.mode),
        data: {
          userPrompt: result.agentRun.userPrompt,
          projectId: result.agentRun.projectId,
        },
      });

      void inngest
        .send({
          name: EVENT_NAMES.projectRename,
          data: {
            projectId: result.rename.projectId,
            userPrompt: result.rename.userPrompt,
          },
        })
        .catch(() => undefined);

      return result.project;
    }),
});
