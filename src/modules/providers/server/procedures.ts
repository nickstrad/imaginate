import { createTRPCRouter, publicProcedure } from "@/trpc/init";
import { getProviderAvailabilityMap } from "@/lib/providers";

export const providersRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    return getProviderAvailabilityMap();
  }),
});
