---
name: plans-audit
description: This skill should be used when the user types "/plans-audit", "/plan-archive", or "/plans-refresh"; asks to audit, archive, retire, refresh, shrink, merge, supersede, or clean up plans; asks whether open plans are stale, completed, overlapping, or worth keeping; or asks to review `docs/plans/open/`. Audits open plans against the current codebase, source-of-truth docs, and other plans, then proposes keep, keep + flag, shrink, salvage-and-merge, supersede, carve remainder, fold-then-retire, archive, or delete decisions with concrete evidence.
---

# Plans Audit

Audit `docs/plans/open/` against the current codebase, source-of-truth docs, and other plans. For each open plan, decide whether it should stay open, be revised, merged, superseded, retired, archived, or deleted.

This skill combines the old `/plan-archive` and `/plans-refresh` workflows. The lifecycle question decides which branch applies:

- **Completed plans** use the retirement rubric from `docs/AGENTS.md` and `docs/plans/AGENTS.md`.
- **Incomplete plans** use the staleness, overlap, and premise-verification rubric below.

`plan-drift-detection` remains separate because it generates new `docs/plans/drift/` plans by comparing `src/` to `docs/architecture/architecture.md`; this skill maintains existing plans.

## Inputs (read before deciding)

Read these in full at the start of every run. Do not skip - plan lifecycle rules live in these files, not in this skill.

1. `AGENTS.md` (repo root) - the entrypoint. Confirms which docs govern plan lifecycle.
2. `docs/AGENTS.md` - docs philosophy, source-of-truth model, and **Plan retirement** rubric.
3. `docs/plans/AGENTS.md` - plan structure rules, conflict-check, subfolder lifecycle, archive protocol, and delete protocol.
4. `docs/architecture/architecture.md` - current architecture contract; needed to judge completion, stale premises, and whether durable facts already live in the contract.
5. `docs/code-style/AGENTS.md` - needed when durable style facts may need folding.
6. `docs/testing/AGENTS.md` - needed when durable testing criteria or verification expectations may need folding.

If those docs disagree with this skill, the docs win - surface the discrepancy.

## Inputs (plans and evidence)

- `docs/plans/open/` - every `*.md` file at the top level, plus every `<concern>/` folder. For folders, read `README.md` and every numbered chunk.
- `docs/plans/drift/` - list contents first. Read only drift plans that overlap a plan being audited. Drift plans have their own lifecycle; do not silently archive or refresh them.
- `docs/plans/archive/` - list contents to avoid name collisions and to spot prior decisions in related areas.
- Current source files, tests, and recent `git log` entries named by each plan. The plan is a claim about the repo; verify the claim still holds.

## Core questions

For each open plan, answer these in order:

1. **Is the plan fully shipped?** Check its definition of done / verification against the current repo.
2. **If not fully shipped, is its premise still true?** Verify concrete claims about paths, imports, functions, behavior, test gaps, or workarounds.
3. **Does it overlap with another open or drift plan?** Compare files, ports, concepts, and chunk deliverables.
4. **Are durable facts missing from source-of-truth docs?** Identify whether facts belong in `architecture.md`, code-style, testing docs, plan rules, documentation, or code.
5. **What is the smallest honest next action?** Prefer keeping a valid plan, shrinking a partially stale one, or retiring completed sequencing-only material over preserving stale context.

## Procedure

Run in order. Parallelize independent reads.

1. **Load the agent guides** listed under "Inputs (read before deciding)".
2. **Inventory `docs/plans/open/`.** For each entry, capture path, single-file vs folder shape, and for folder plans the chunk index from `README.md`.
3. **Read each open plan in full.** Folder plans: read `README.md` plus every numbered chunk.
4. **Verify completion and premise.**
   - For completed-plan candidates, confirm every promised path, symbol, behavior, test, migration step, and chunk deliverable exists.
   - For incomplete plans, check every concrete premise: path names, current code shape, repeated patterns, settings, behavior, and named workarounds.
   - If completion or premise cannot be verified, treat that as evidence and default to **keep** or **keep + flag** unless the plan is actively misleading.
5. **Cross-check for overlap.** Identify sibling open or drift plans that touch the same files, concerns, ports, or architecture rules. If two valid plans conflict and neither is clearly stale, report the conflict and stop short of choosing a winner.
6. **Classify each plan** using the decision table below. Cite at least one concrete piece of evidence per decision: a path, line number, chunk reference, source-of-truth rule, or sibling plan section.
7. **Report decisions before changing files.** Wait for explicit user approval unless the user already authorized edits, moves, or deletes up front.
8. **Execute approved actions** exactly as reported. For plan edits, keep filenames and frontmatter unless the approved action says otherwise.

## Decisions

| Decision | When to choose it |
| --- | --- |
| **keep** | Plan remains accurate, useful, and not meaningfully overlapped. Default when evidence is ambiguous. |
| **keep + flag** | Plan remains useful, but overlap, unclear evidence, or a possible conflict should be resolved next time the plan is edited. |
| **shrink** | Part of the plan is done or stale, but meaningful work remains. Rewrite the plan to the remaining work only; do not append a changelog. |
| **salvage-and-merge** | The plan is mostly stale, but 1-3 durable or actionable pieces belong in another open plan. Name the target plan and section, show exact text, then delete the source after approval. |
| **supersede** | Another open plan has absorbed this plan's scope. Add a concise supersession note to the target plan's "Conflicts checked" or equivalent section, then delete the source after approval. |
| **carve remainder** | The plan is mostly complete, but a small unfinished piece remains. Create a new, smaller `open/` plan for the remainder before retiring the parent. |
| **fold-then-retire** | The plan is complete, but durable facts must move into a source-of-truth doc before archive/delete. Name the target doc and snippet. |
| **archive** | The plan is complete and preserves lasting decision context: non-obvious architecture choice, migration rationale, durable tradeoff, or multi-step migration record. |
| **delete** | The plan is completed sequencing-only, abandoned, misleading, stale with no salvageable content, or durable facts already live in source-of-truth docs or code. |

## Approved action rules

- **keep / keep + flag**: no file changes. Flags go in the report only.
- **shrink**: edit the plan body in place. Preserve filename and frontmatter.
- **salvage-and-merge**: edit the target plan first, then remove the source. Never silently merge; show the exact moved text before applying.
- **supersede**: edit the target plan's "Conflicts checked" or equivalent section first, then remove the source.
- **carve remainder**: create the new `docs/plans/open/<concern>.md` or folder first, then retire the parent.
- **fold-then-retire**: update the target source-of-truth doc first, then archive or delete in the same change set.
- **archive**: `git mv docs/plans/open/<x> docs/plans/archive/<x>`. Preserve filename and folder structure. Do not rewrite to past tense.
- **delete**: remove the file or folder. The commit message must explain why durable facts no longer need a plan, or why the abandoned/stale framing should disappear.

## Drift plans

Drift plans are listed for context but are not refreshed by this skill. They are deleted after realignment ships unless they preserve lasting decision context worth archiving.

Flag any drift plan that is completed, contradicted, or superseded by an open plan, but do not move or delete it unless the user explicitly approves that extra action.

## Output format

Default to one table:

```markdown
| Plan | State | Decision | Evidence | Proposed action |
| --- | --- | --- | --- | --- |
| open/sandbox-auto-revive.md | incomplete, premise true | keep | `src/lib/sandbox/...` still lacks revive flow named in Definition of done | none |
| open/agent-telemetry-refactor/ | partially stale | shrink | chunks 01-02 landed; chunks 03-04 still match current telemetry shape | rewrite to remaining chunks |
| open/openrouter-model-route-fallbacks.md | shipped | archive | captures fallback-policy tradeoff not present in architecture docs | `git mv ...` |
```

Follow with **Proposed actions**:

- Exact edits for shrink, salvage-and-merge, supersede, carve remainder, or fold-then-retire.
- Exact `git mv`, `git rm`, or removal commands for archive/delete.
- Any open conflicts that require a human decision.

## Rules of engagement

- **Never edit, move, or delete a plan without explicit user approval** in the same session, unless the user invoked the skill with an apply directive like "audit and apply".
- **No bulk sweeps without reading.** Every decision must cite specific evidence from the plan and current repo state.
- **Conflicts surface, don't vanish.** If two valid plans conflict, report the conflict and stop short of resolving it unless one is clearly stale or superseded.
- **Architecture doc edits** must respect the architecture-change process in `docs/AGENTS.md`: plan first, then update `architecture.md` deliberately in the implementation change set.
- **Plan text describes intent, not history.** When shrinking or merging, update the plan to the remaining/current work instead of adding a changelog.

## When not to use this skill

- Creating or editing a new plan from scratch: use `/plan`.
- Generating drift plans: use `/plan-drift-detection`.
- Executing the code changes described by a plan: follow that plan and the relevant code docs.
- A user already decided a single plan should be moved or deleted: apply that specific decision directly, while still following `docs/plans/AGENTS.md`.
