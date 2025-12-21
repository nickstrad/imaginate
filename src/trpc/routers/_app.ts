import { createTRPCRouter } from "../init";
import { projectsRouter } from "@/modules/projects/server/procedures";
import { messagesRouter } from "@/modules/messages/server/procedures";
import { usageRouter } from "@/modules/usage/server/procedures";
import { settingsRouter } from "@/modules/settings/server/procedures";

export const appRouter = createTRPCRouter({
  messages: messagesRouter,
  projects: projectsRouter,
  usage: usageRouter,
  settings: settingsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
