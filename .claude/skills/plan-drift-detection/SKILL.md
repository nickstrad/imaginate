---
name: plan-drift-detection
description: This skill should be used when the user types "/plan-drift-detection", asks to "detect drift", "check architecture drift", "find drift from architecture", "audit src against architecture.md", or asks to update plans/drift with refactors needed to realign the repo with docs/architecture/architecture.md. Scans the current state of `src/` against the documented architecture and writes one plan file per detected drift into `docs/plans/drift/`.
---

# Drift Detection

Detect places where merged code in `src/` no longer matches the rules in `docs/architecture/architecture.md`, and write one refactor plan per drift into `docs/plans/drift/`.

## Inputs

- **Source of truth**: `docs/architecture/architecture.md` — read it in full at the start of every run. Treat its rules as the contract.
- **Current state**: everything under `src/`. Inspect file layout, imports, and folder conventions.
- **Output dir**: `docs/plans/drift/`. Create it if missing.

## What counts as drift

Look for, at minimum, these categories. Do not limit the audit to this list — anything the architecture doc states as a rule is in scope.

1. **Direction-of-dependencies violations.** e.g. `src/lib/**` importing from `src/inngest`, `src/app`, `src/modules`, `src/trpc`, or `src/ui`. Or `src/inngest/**` importing from `app/modules/ui`.
2. **Folder-shape violations under `src/lib/<concern>/`.** Missing `index.ts` barrel, missing `constants.ts`/`types.ts` where applicable, files placed directly under `src/lib/` instead of a concern folder, sibling concern files importing each other when they should not.
3. **Deep-path imports** that bypass a barrel (e.g. `@/lib/agents/state` from outside the folder instead of `@/lib/agents`).
4. **Misplaced code.** Module-specific UI under `src/ui/`, business logic in `src/trpc/`, pure logic living in `src/inngest/functions.ts`, route files doing data fetching that belongs in a module.
5. **Path-alias drift.** Relative imports climbing out of a folder instead of using `@/...`.
6. **Stale `components.json` / `tsconfig` aliases** vs. actual folders.
7. **Recent-moves regressions.** Re-introduction of any path listed under "Recent moves to be aware of" in `architecture.md` (e.g. a new `src/components/` or `src/db.ts`).
8. **Architecture doc itself stale.** If `src/` contains a real, intentional structure that the doc does not describe, that is also drift — flag it as a doc-update plan.

## Procedure

Run these steps in order. Use parallel tool calls where independent.

1. **Read the architecture doc.** Read `docs/architecture/architecture.md` end to end before anything else. Extract the concrete rules (allowed import directions, folder shape, alias targets, "where to put new code" table, recent moves).
2. **Survey `src/`.** List the top-level layout and each `src/lib/<concern>/` folder shape. Use `find`/`ls` plus targeted `grep` rather than reading every file.
3. **Run targeted checks** for the categories above. Useful searches:
   - Forbidden lib imports: `grep -rE "from \"@/(inngest|app|modules|trpc|ui)" src/lib`
   - Deep-path lib imports from outside lib folders: `grep -rE "from \"@/lib/[a-z-]+/[a-z-]+\"" src --include="*.ts" --include="*.tsx"` then filter out same-folder relative imports.
   - Files directly under `src/lib/`: `find src/lib -maxdepth 1 -type f`
   - Missing barrels: for each `src/lib/*/`, check `index.ts` exists.
   - Stale paths from "Recent moves": `find src -path src/components -o -path src/hooks -o -path src/logo -o -name db.ts -not -path "*/lib/*"`
4. **Group findings into refactors.** One plan file per coherent refactor, not one per file. e.g. "Move stray helper out of `src/lib/foo.ts` into a concern folder" is one plan even if it touches several callers.
5. **Check for existing plans.** Read existing files in `docs/plans/drift/` first. Update an existing plan instead of creating a duplicate. Skip drifts already covered.
6. **Write one plan per refactor** into `docs/plans/drift/<short-kebab-name>.md` using the template below.
7. **Report back.** Print a short summary: how many drifts found, which plans were created vs. updated vs. skipped, and any drift the skill explicitly chose not to file (with reason).

If no drift is found, write nothing and report "no drift detected".

## Plan file template

Each `docs/plans/drift/<refactor>.md` file uses this exact structure:

```markdown
# <Short refactor title>

## Overview

<2–4 sentence summary of the suggested refactor and its scope.>

## How it's out of sync

<Cite the specific rule(s) from architecture.md that are violated. Quote the rule briefly. List the concrete offending paths/imports with `file:line` references where useful.>

## What "in sync" looks like

<One or more small examples — diff snippets, before/after import lines, target folder layout, or a tiny code sketch — that illustrate the desired end state. Does not need to be complete code; just enough to anchor the fix.>

## Suggested steps

<Bulleted, ordered checklist a reviewer can follow. Keep it tight.>
```

## Style rules for generated plans

- Reference architecture.md rules by section name (e.g. "Direction of dependencies", "Folder convention") so the reader can cross-check.
- Prefer **before/after** examples over prose. Imports, folder trees, and short snippets are more useful than paragraphs.
- Do not propose fixes that exceed the rule being violated — keep each plan scoped to realigning with the doc.
- Use kebab-case filenames that name the refactor, not the symptom: `move-db-singleton-into-lib.md`, not `fix-broken-import.md`.
- If the right fix is to update `architecture.md` instead of the code (intentional new structure), say so explicitly in the plan.

## Non-goals

- Do not execute the refactors — only write plans.
- Do not modify `src/` or `architecture.md` during a drift run.
- Do not file drifts for code style, naming, or test coverage unless `architecture.md` mandates them.
