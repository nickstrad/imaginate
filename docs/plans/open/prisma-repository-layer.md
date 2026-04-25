# Prisma repository layer

Deferred from the testability refactor (Phase 7 deeper split — TRPC procedures).

Status: ⬜ not started.

## Goal

Introduce thin repos (`projectRepo`, `messageRepo`) so procedures and Inngest functions depend on an interface that tests can fake — mirroring the `TelemetryStore` pattern in `src/lib/agents/telemetry.ts`.

## Architectural notes

- Expand `src/lib/db/` to standard concern shape: `types.ts` (repo interfaces), `projects.ts`, `messages.ts` (concrete impls taking an injected `PrismaClient`-like dep), keep singleton in `index.ts` and re-export through the barrel.
- Procedures and Inngest functions import `@/lib/db` for both the client and the repos.

## Before

`src/lib/db/index.ts` is just a singleton:

```ts
export const prisma = globalForPrisma.prisma || new PrismaClient();
```

Callers reach into Prisma directly:

```ts
// src/modules/projects/server/procedures.ts
const project = await prisma.project.create({
  data: {
    name: placeholderName(),
    messages: { create: { content: input.userPrompt, role: "USER", ... } },
  },
});

// src/inngest/functions.ts
await prisma.message.update({
  where: { id: persistedMessageId },
  data: { thoughts: thoughtsToPrismaJson(thoughts) },
});
```

Tests must mock the entire `PrismaClient` surface or hit a real DB.

## After

`src/lib/db/types.ts`:

```ts
import type { Project, Message } from "@/generated/prisma";

export interface ProjectRepo {
  create(input: { userPrompt: string; mode: "code" | "ask" }): Promise<Project>;
  evictOldest(limit: number): Promise<void>;
  findById(id: string): Promise<Project | null>;
}

export interface MessageRepo {
  create(input: { projectId: string; content: string; ... }): Promise<Message>;
  updateThoughts(id: string, thoughts: unknown): Promise<void>;
  // Matches functions.ts:544-567 — final message write with content/type/status/fragment.
  update(id: string, data: { content?: string; type?: MessageType; status?: MessageStatus; fragment?: unknown }): Promise<void>;
}

// Note: grow these interfaces with usage. Don't add `findByProjectId`,
// `softDelete`, etc. speculatively — every method is a fake to maintain in tests.
```

`src/lib/db/projects.ts`:

```ts
import type { PrismaClient } from "@/generated/prisma";
import type { ProjectRepo } from "./types";

export function createProjectRepo(db: PrismaClient): ProjectRepo {
  return {
    create: ({ userPrompt, mode }) =>
      db.project.create({
        data: {
          name: placeholderName(),
          messages: { create: { content: userPrompt, role: "USER", ... } },
        },
      }),
    evictOldest: (limit) => db.$executeRaw`...`,
    findById: (id) => db.project.findUnique({ where: { id } }),
  };
}
```

`src/lib/db/index.ts`:

```ts
export const prisma = globalForPrisma.prisma || new PrismaClient();
export const projectRepo = createProjectRepo(prisma);
export const messageRepo = createMessageRepo(prisma);
export * from "./types";
```

Caller:

```ts
// procedures.ts
import { projectRepo } from "@/lib/db";
const project = await projectRepo.create({ userPrompt, mode });
await projectRepo.evictOldest(PROJECT_LIMIT);
```

Test:

```ts
const fakeProjectRepo: ProjectRepo = {
  create: async (input) => ({ id: "p1", name: "x", ... }),
  evictOldest: async () => {},
  findById: async () => null,
};
```

## Folded sub-task: raw-SQL eviction

Move the `prisma.$executeRaw` eviction from `src/modules/projects/server/procedures.ts` into `projectRepo.evictOldest` in this same PR:

```ts
// src/lib/db/projects.ts
return {
  // ...
  // Raw SQL: race-free single round-trip vs. count/find/delete.
  evictOldest: (limit) => db.$executeRaw`
    DELETE FROM "Project"
    WHERE id IN (
      SELECT id FROM "Project"
      ORDER BY "updatedAt" DESC
      OFFSET ${limit}
    )
  `,
};
```

Procedure becomes `await projectRepo.evictOldest(PROJECT_LIMIT);`.

## Gain

- Tests for procedures/inngest functions stop needing a Prisma mock or live DB.
- Query shape lives in one place — easier to spot N+1s and inconsistent orderings.
- Eviction policy moves out of the HTTP layer.
- Aligns DB layer with the existing `TelemetryStore` pattern.

## Doc updates (same PR)

- Update `docs/architecture/architecture.md` `src/lib/db/` description from "Prisma client singleton" to include the repo layer (`types.ts`, `projects.ts`, `messages.ts`).
- Add a "New repo method → `src/lib/db/<entity>.ts`" row to the "Where to put new code" table.
