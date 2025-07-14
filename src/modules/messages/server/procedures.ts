import { prisma } from "@/db";
import { inngest } from "@/inngest/client";
import { baseProcedure, createTRPCRouter } from "@/trpc/init";
import z from "zod";

export const messagesRouter = createTRPCRouter({
  getMany: baseProcedure.query(async () => {
    return prisma.message.findMany({
      orderBy: { updatedAt: "asc" },
    });
  }),
  create: baseProcedure
    .input(
      z.object({
        value: z.string().min(1, { message: "Message cannot be empty." }),
      })
    )
    .mutation(async ({ input: { value: userMessage } }) => {
      const createdMessage = await prisma.message.create({
        data: {
          content: userMessage,
          role: "USER",
          type: "RESULT",
        },
      });

      await inngest.send({
        name: "codeAgent/run",
        data: { userMessage },
      });

      return createdMessage;
    }),
});
