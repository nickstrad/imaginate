---
name: plans-refresh
description: This skill should be used when the user types "/plans-refresh", asks to "refresh plans", "review open plans", "find stale plans", "check for superseded plans", "merge overlapping plans", or "audit docs/plans/open for staleness". Reviews each plan in docs/plans/open against the current codebase and the other open plans, then proposes per-plan decisions — keep, shrink, salvage-and-merge into another plan, supersede, or delete — citing concrete evidence.
---

# Plans Refresh

Audit `docs/plans/open/` for plans whose value has decayed since they were written. Unlike `/plan-archive`, this skill targets plans that are **not yet finished** but have lost relevance: parts implemented incidentally, framing falsified by a newer plan, scope absorbed into a larger refactor, or premise no longer matches the codebase.

For each open plan, propose one of: **keep**, **shrink**, **salvage-and-merge**, **supersede**, **delete**. Cite specific evidence from the plan, the codebase, and overlapping plans.

## When to use

Trigger phrases: "refresh plans", "review open plans", "stale plans", "do any of these plans still make sense", "are these plans superseded", "merge overlapping plans".

Differs from `/plan-archive`: archive handles _completed_ plans against the retirement rubric. Refresh handles _open, in-flight_ plans whose framing or scope has drifted.

## Inputs (read before deciding)

Read these in full before judging any plan. The retirement and overlap rules live in the docs, not this skill.

1. `AGENTS.md` (repo root) — the entrypoint.
2. `docs/AGENTS.md` — docs philosophy and **Plan retirement** rubric.
3. `docs/plans/AGENTS.md` — plan structure rules, conflict-check, subfolder lifecycle.
4. `docs/architecture/architecture.md` — current architecture contract; needed to judge "premise no longer fits the codebase".
5. `docs/code-style/AGENTS.md` and `docs/testing/AGENTS.md` — needed when a plan's durable facts may already live there.

If the docs disagree with this skill, the docs win — surface the discrepancy.

## Inputs (the plans and the code)

- Every `*.md` at the top of `docs/plans/open/` and every `<concern>/` folder (read `README.md` plus chunks).
- `docs/plans/drift/` — list only; drift plans have their own lifecycle.
- `docs/plans/archive/` — list to avoid name collisions.
- Current `src/` state, recent `git log`, and any specific files a plan names. The plan is a _claim_ about the code; verify the claim still holds.

## Procedure

Run in order. Parallelize independent reads.

1. **Load the agent guides** above.
2. **Inventory `docs/plans/open/`.** Capture path, single-file vs folder, and chunk index for folder plans.
3. **Read each open plan in full.** Folder plans: read `README.md` plus every chunk.
4. **Verify each plan's premise against the current repo.** For every concrete claim — a path, a function, a code shape ("X currently lives outside Y"), a behavior ("retries reach the LLM call") — check it. Use `grep`, `find`, `git log`, or read the file. Note what is still true, what is false, and what is partially done.
5. **Cross-check for overlap.** For each plan, identify other open plans that touch the same files, ports, or concerns. A plan can be entirely subsumed by a larger refactor (e.g. ports/adapters migration making a testability concern moot) or partially duplicated by another plan's chunk.
6. **Classify each plan** using the rubric below. Cite at least one piece of concrete evidence per decision (a path, a line number, a chunk reference, or a sibling plan's section).

   | Decision              | When to choose it                                                                                                                                                       |
   | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | **keep**              | Premise still holds, no overlap, no incidental implementation. Default when in doubt.                                                                                   |
   | **shrink**            | Most of the plan's premise is false or already implemented, but a small piece remains. Rewrite the plan body to the remaining work only. Note what was removed and why. |
   | **salvage-and-merge** | The plan is mostly stale but contains 1–3 nuggets that belong inside another open plan. Name the target plan + section, propose the exact text, then delete the source. |
   | **supersede**         | A larger plan has absorbed this one's scope. Add a one-line "superseded by X" note in the target plan's "Conflicts checked" section, then delete the source.            |
   | **delete**            | Premise no longer matches the codebase, no salvageable nuggets, and no remaining work. The original framing would mislead anyone picking it up cold.                    |
   | **keep + flag**       | Premise still holds but durable facts overlap with another plan. Flag the overlap so the author can resolve it next time they edit either plan.                         |

7. **Report decisions** as a table before doing any moves (see Output format).
8. **Wait for user approval** unless the user authorized moves up front. Default is propose-then-apply.
9. **Execute approved actions:**
   - **shrink**: edit the plan body in place. Keep the filename and frontmatter.
   - **salvage-and-merge**: edit the target plan first (paste the salvaged content into the named section), then `rm` the source. Single PR.
   - **supersede**: edit the target plan's "Conflicts checked" (or equivalent) section to record the supersession, then `rm` the source.
   - **delete**: `rm` the file or folder. Commit message must say _why_ the framing no longer fits and confirm no salvageable content.
   - For **keep** and **keep + flag**: no file changes; flags go in the report only.

## Verifying premise — what "evidence" looks like

- A plan claims "X lives outside step.run" → read the current file and confirm it does or doesn't.
- A plan claims "Y is duplicated across handlers" → grep for Y across the named handlers.
- A plan promises a refactor that another plan also covers → read both plans' "Definition of done" sections and identify which subset overlaps.
- A plan's "Current workaround" section names a setting → grep for the setting and confirm it's still in place.

A premise that _cannot_ be verified from the file system or git history is itself a red flag — the plan may be operating on a mental model that has drifted from the code.

## Output format

Default to a single table in the chat reply:

```
| Plan                                  | Premise still true?         | Decision             | Justification                                                              |
| ------------------------------------- | --------------------------- | -------------------- | -------------------------------------------------------------------------- |
| open/inngest-reliability-refactor.md  | partially (LLM wrap done)   | salvage-and-merge    | 3 of 5 sections obsolete; 2 nuggets fit agent-core/04 Inngest follow-ups   |
| open/sandbox-auto-revive.md           | yes                         | keep                 | No overlap; src/lib/sandbox still lacks revive logic                       |
| open/agent-telemetry-refactor/        | yes, but overlaps           | keep + flag          | Usage-logging chunk overlaps agent-core/05; mark for resolution            |
```

Follow with a **Proposed actions** section:

- For each non-keep decision, the exact edits and `rm` commands.
- For salvage-and-merge: the literal text to paste into the target plan (under a named section), then the source delete.

## Rules of engagement

- **Never edit or delete a plan without explicit user approval** in the same session, unless the user invoked the skill with a directive ("refresh and apply").
- **Never silently merge.** Salvage-and-merge requires showing the exact text being moved and where it lands.
- **Drift plans**: list them but do not refresh them — they have their own lifecycle in `docs/plans/AGENTS.md`. Flag any drift plan whose premise has been falsified by a recent commit.
- **Conflicts surface, don't resolve.** If two open plans conflict and neither is clearly stale, report the conflict and stop. Do not pick a winner.
- **Architecture doc edits**: if salvage requires updating `architecture.md`, follow the architecture-changes process in `docs/AGENTS.md` (plan first). Plan-to-plan moves don't need that gate.
- **No bulk sweeps without reading.** Every decision must cite a specific line/path/section. "Looks stale" is not evidence.

## When NOT to use this skill

- Auditing _completed_ plans for archive vs delete → use `/plan-archive`.
- Generating drift plans → use `/plan-drift-detection`.
- Creating or editing a plan from scratch → use `/plan`.
- A user already decided a single plan should be deleted/merged — just do it directly without running the full audit.
