import { listProviderAvailability } from "@/features/providers";
import { createTRPCRouter, publicProcedure } from "../init";

export const providersRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    return listProviderAvailability();
  }),
});
