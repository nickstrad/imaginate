import { MessageMode, type Project } from "@/generated/prisma";
import { prisma } from "@/platform/db";
import type {
  CreateProjectRecordInput,
  ProjectRepository,
} from "../application";

function toPrismaMode(mode: CreateProjectRecordInput["mode"]): MessageMode {
  return mode === "ask" ? MessageMode.ASK : MessageMode.CODE;
}

export function createPrismaProjectRepository(): ProjectRepository {
  return {
    getById(id: string): Promise<Project | null> {
      return prisma.project.findUnique({ where: { id } });
    },
    listRecent(limit: number): Promise<Project[]> {
      return prisma.project.findMany({
        orderBy: { updatedAt: "desc" },
        take: limit,
      });
    },
    createWithInitialUserMessage(
      input: CreateProjectRecordInput
    ): Promise<Project> {
      return prisma.project.create({
        data: {
          name: input.name,
          messages: {
            create: {
              content: input.userPrompt,
              role: "USER",
              type: "RESULT",
              mode: toPrismaMode(input.mode),
            },
          },
        },
      });
    },
    async pruneAfterRecentLimit(limit: number): Promise<void> {
      await prisma.$executeRaw`
        DELETE FROM "Project"
        WHERE id IN (
          SELECT id FROM "Project"
          ORDER BY "updatedAt" DESC
          OFFSET ${limit}
        )
      `;
    },
    async updateName(id: string, name: string): Promise<void> {
      await prisma.project.update({ where: { id }, data: { name } });
    },
  };
}
