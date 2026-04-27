import { PrismaClient } from "@/generated/prisma";
import { isProduction } from "@/platform/config/env";

const globalForPrisma = global as unknown as {
  prisma: PrismaClient;
};

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}
