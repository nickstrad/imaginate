# `project/rename` Inngest event

Deferred from the testability refactor (Phase 7 deeper split — TRPC procedures).

Status: ⬜ not started — **deferred / backlog**. One event, one call site; the `naming.ts` move it requires has no other beneficiary. Revisit if observability of rename failures becomes a concern, or if naming logic grows beyond a single AI call.

## Goal

Replace fire-and-forget `renameProjectInBackground` with a typed Inngest event so failures are observable and retryable.

## Architectural notes

- `src/inngest/*` MUST NOT import from `src/modules`. The naming logic currently lives in `src/modules/projects/server/naming.ts`, so it must move first.
- Suggested new home: `src/lib/naming/` (standard concern shape: `constants.ts`, `types.ts`, `naming.ts`, `index.ts` barrel). It's a focused AI call independent of the agent runtime.
- Add a "Recent moves" entry and a `src/lib/naming/` section to `docs/architecture/architecture.md` once `naming.ts` moves.

## Before

`src/modules/projects/server/procedures.ts`:

```ts
async function renameProjectInBackground(
  projectId: string,
  userPrompt: string
) {
  try {
    const raw = await generateRawProjectName(userPrompt);
    const name = buildProjectName(raw);
    if (!name) {
      return;
    }
    await prisma.project.update({ where: { id: projectId }, data: { name } });
  } catch {
    // swallow — placeholder name is acceptable
  }
}

// inside `create` mutation, after inngest.send(...):
void renameProjectInBackground(project.id, input.userPrompt);
```

`src/inngest/events.ts`:

```ts
export const EVENT_NAMES = {
  codeAgentRun: "codeAgent/run",
  askAgentRun: "askAgent/run",
} as const;
```

## After

`src/lib/naming/index.ts` exports `generateRawProjectName`, `buildProjectName`, `placeholderName`.

`src/inngest/events.ts`:

```ts
export const EVENT_NAMES = {
  codeAgentRun: "codeAgent/run",
  askAgentRun: "askAgent/run",
  projectRename: "project/rename",
} as const;

export type ProjectRenameEvent = {
  name: typeof EVENT_NAMES.projectRename;
  data: { projectId: string; userPrompt: string };
};
```

`src/inngest/functions.ts` (new function):

```ts
import { generateRawProjectName, buildProjectName } from "@/lib/naming";
import { prisma } from "@/lib/db";

export const renameProject = inngest.createFunction(
  { id: "project-rename", retries: 3 },
  { event: EVENT_NAMES.projectRename },
  async ({ event, step }) => {
    const raw = await step.run("generate-name", () =>
      generateRawProjectName(event.data.userPrompt)
    );
    const name = buildProjectName(raw);
    if (!name) {
      return { skipped: true };
    }
    await step.run("update-project", () =>
      prisma.project.update({
        where: { id: event.data.projectId },
        data: { name },
      })
    );
    return { name };
  }
);
```

`src/modules/projects/server/procedures.ts` (producer):

```ts
import { placeholderName } from "@/lib/naming";

await inngest.send({
  name: EVENT_NAMES.projectRename,
  data: { projectId: project.id, userPrompt: input.userPrompt },
});
```

## Gain

- Failures become visible in the Inngest dashboard instead of silently swallowed.
- Automatic retries on transient AI/Prisma failures.
- `procedures.ts` shrinks: `generateRawProjectName` and `renameProjectInBackground` move out.
- Removes architectural smell of business logic running detached from any observable execution context.
