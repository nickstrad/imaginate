import { createTRPCRouter } from "../init";
import { projectsRouter } from "../procedures/projects";
import { messagesRouter } from "../procedures/messages";
import { providersRouter } from "../procedures/providers";

export const appRouter = createTRPCRouter({
  messages: messagesRouter,
  projects: projectsRouter,
  providers: providersRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
