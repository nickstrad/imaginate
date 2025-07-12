import { z } from "zod";
import { baseProcedure, createTRPCRouter } from "../init";
import { inngest } from "@/inngest/client";
export const appRouter = createTRPCRouter({
  invoke: baseProcedure
    .input(
      z.object({
        userMessage: z.string(),
      })
    )
    .mutation(async ({ input: { userMessage } }) => {
      await inngest.send({
        name: "createCode",
        data: { userMessage },
      });
      return { ok: "success" };
    }),
});
// export type definition of API
export type AppRouter = typeof appRouter;
