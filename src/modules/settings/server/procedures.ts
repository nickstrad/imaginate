import { prisma } from "@/db";
import { protectedProcedure, createTRPCRouter } from "@/trpc/init";
import z from "zod";
import { encryptApiKeys, decryptApiKeys } from "@/lib/encryption";

const apiKeySchema = z.object({
  geminiApiKey: z.string().optional().default(""),
  openaiApiKey: z.string().optional().default(""),
  anthropicApiKey: z.string().optional().default(""),
});

export const settingsRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.auth.userId;

    try {
      let settings = await prisma.settings.findUnique({
        where: { userId },
      });

      if (!settings) {
        settings = await prisma.settings.create({
          data: {
            userId,
            geminiApiKey: "",
            openaiApiKey: "",
            anthropicApiKey: "",
          },
        });

        return {
          geminiApiKey: "",
          openaiApiKey: "",
          anthropicApiKey: "",
        };
      }

      const decryptedKeys = decryptApiKeys(
        {
          geminiApiKey: settings.geminiApiKey,
          openaiApiKey: settings.openaiApiKey,
          anthropicApiKey: settings.anthropicApiKey,
        },
        userId
      );

      return decryptedKeys;
    } catch (error) {
      console.error("Error fetching settings:", error);
      throw new Error("Failed to fetch settings");
    }
  }),

  save: protectedProcedure
    .input(apiKeySchema)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.auth.userId;

      try {
        const encryptedKeys = encryptApiKeys(
          {
            geminiApiKey: input.geminiApiKey || "",
            openaiApiKey: input.openaiApiKey || "",
            anthropicApiKey: input.anthropicApiKey || "",
          },
          userId
        );

        await prisma.settings.upsert({
          where: { userId },
          create: {
            userId,
            ...encryptedKeys,
          },
          update: {
            ...encryptedKeys,
          },
        });

        return { success: true };
      } catch (error) {
        console.error("Error saving settings:", error);
        throw new Error("Failed to save settings");
      }
    }),
});
