import { initTRPC } from "@trpc/server";
import { cache } from "react";
import superjson from "superjson";

type CreateContextOptions = {
  req?: Request;
};

function getIpFromRequest(req: Request | undefined): string | null {
  if (!req) return null;
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return null;
}

export const createTRPCContext = cache(async (opts?: CreateContextOptions) => {
  return { ip: getIpFromRequest(opts?.req) };
});

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;
