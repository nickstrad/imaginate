---
name: imaginate-workflow-3-tracer-bullets
description: ONLY invoke when the user types `/imaginate-workflow-3-tracer-bullets` or explicitly names this skill. Do NOT auto-trigger on phrases like "break into tickets" or "slice this work" — the user controls when this step runs so they can batch the workflow. Converts an existing PRD at `docs/plans/<feature>/prd.md` into vertical-slice ticket files with `blocked_by` dependencies, written into the same feature folder.
---

# Tracer Bullets — Vertical Slices

Break the PRD into independently-grabbable issues using vertical slices. Each slice must touch the data layer, a service/logic layer, and a minimal UI representation so the agent (or human) gets immediate end-to-end feedback when it lands.

## Procedure

1. **Locate the PRD.** PRDs live at `docs/plans/<feature-slug>/prd.md`. Default to the most recently modified `prd.md` under `docs/plans/`. If the user named a feature slug, use `docs/plans/<slug>/prd.md`.
2. **Identify the vertical slices.** A slice is the thinnest possible end-to-end path that delivers user-visible behavior. Examples: "user can save one field", "user can see a single read-only row." Three to seven slices is typical; if you have more than ten, you're slicing too thin.
3. **For each slice, write a ticket file** at `docs/plans/<feature-slug>/NN-<slice-slug>.md` (alongside the existing `prd.md`) with this shape:

   ```markdown
   ---
   id: NN-<slice-slug>
   blocks: [list of ticket ids this unblocks]
   blocked_by: [list of ticket ids that must complete first]
   status: ready
   ---

   # NN — <slice title>

   ## Goal

   One sentence describing the user-visible outcome.

   ## Touches

   - schema: <file or "none">
   - service: <file>
   - ui: <file>

   ## Acceptance

   - [ ] failing test exists at <path> exercising <behavior>
   - [ ] test passes
   - [ ] type-check clean
   - [ ] manual smoke: <one concrete click-path>

   ## Notes

   Any constraints from the PRD that apply specifically to this slice.
   ```

4. **Wire dependencies.** A slice that depends on schema from another slice declares it via `blocked_by`. Keep the graph shallow — most slices should have zero or one dependency. If everything depends on slice 1, that's a sign slice 1 is doing too much.
5. **Anti-horizontal check.** Reject any slice whose title is "set up the database", "build the API", or "create the form." Those are layers, not slices. Re-slice vertically.
6. **Index file.** Write `docs/plans/<feature-slug>/README.md` listing every ticket with its status and one-line goal — this is what `ralph-loop` reads to pick work.
7. **Report back** with the directory path and the count of tickets created. Do not paste ticket bodies into chat.

## Anti-patterns

- Don't slice horizontally (all DB, then all API, then all UI). The whole point is end-to-end feedback per slice.
- Don't create a ticket for "write tests" — TDD is part of every ticket's acceptance, not a separate slice.
- Don't create tickets for refactors that aren't required by the PRD. If the architecture is in the way, run `improve-architecture` separately.
