import { PrismaClient } from "@/generated/prisma";
import { isProduction } from "@/lib/config/env";

const globalForPrisma = global as unknown as {
  prisma: PrismaClient;
};

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}
