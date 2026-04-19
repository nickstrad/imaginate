import { createTRPCRouter } from "../init";
import { projectsRouter } from "@/modules/projects/server/procedures";
import { messagesRouter } from "@/modules/messages/server/procedures";
import { providersRouter } from "@/modules/providers/server/procedures";

export const appRouter = createTRPCRouter({
  messages: messagesRouter,
  projects: projectsRouter,
  providers: providersRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
