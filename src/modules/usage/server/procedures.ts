import { getUsageStatus } from "@/modules/usage/lib/usage";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

export const usageRouter = createTRPCRouter({
  status: protectedProcedure.query(async ({ ctx }) => {
    try {
      const val = await getUsageStatus(ctx.auth.userId);

      return val;
    } catch (error) {
      return null;
    }
  }),
});
