---
name: plan-archive
description: This skill should be used when the user types "/plan-archive", asks to "archive plans", "retire plans", "clean up open plans", "review plans for archival", or "audit docs/plans/open". Reads the repo's agent guides and every open plan, then proposes which plans to archive, delete, or leave open per the retirement policy in `docs/AGENTS.md` and `docs/plans/AGENTS.md`.
---

# Plan Archive

Audit `docs/plans/open/` (and `docs/plans/drift/` where relevant) against the current source-of-truth agent guides, then recommend an archive / delete / keep decision for each open plan. Apply approved decisions with `git mv` (archive) or `git rm` (delete).

## Inputs (read before deciding)

Read these in full at the start of every run. Do not skip — the retirement policy lives in these files, not in this skill.

1. `AGENTS.md` (repo root) — the entrypoint. Confirms which docs govern plan lifecycle.
2. `docs/AGENTS.md` — docs philosophy and the **Plan retirement** section (the archive-vs-delete rubric).
3. `docs/plans/AGENTS.md` — plan structure rules and the **Subfolder rules → archive/** + **delete protocol** sections.
4. `docs/architecture/architecture.md` — needed to judge whether a plan's durable facts already live in the architecture contract.
5. `docs/code-style/AGENTS.md` — needed to judge whether durable style facts already live there.

If any of those files have changed wording for retirement, the doc wins over this skill — surface the discrepancy.

## Inputs (the plans themselves)

- `docs/plans/open/` — every `*.md` file at the top level, plus every `<concern>/` folder (read its `README.md` and chunk files).
- `docs/plans/drift/` — list contents only; drift plans have their own lifecycle (`docs/plans/AGENTS.md` → drift subsection). Flag any drift plan that already shipped, but do not auto-archive drift plans.
- `docs/plans/archive/` — list contents to avoid recommending a name collision.

## Procedure

Run in order. Parallelize independent reads.

1. **Load the agent guides** listed under "Inputs (read before deciding)".
2. **Inventory `docs/plans/open/`.** For each entry, capture: path, single-file vs folder shape, and (for folder plans) the chunk index from `README.md`.
3. **Read each open plan in full.** Folder plans: read `README.md` + every numbered chunk.
4. **Determine completion status** for each plan. A plan is a candidate for retirement only when its "Definition of done / Verification" holds in `main`. Evidence to look for:
   - Specific paths/symbols the plan promised to add, move, or delete — confirm via the file system or `grep`.
   - Behavior changes the plan describes — confirm the relevant code reflects them.
   - For folder plans, every numbered chunk's deliverable is present.
     If completion is ambiguous, default to **keep open** and note what evidence is missing.
5. **Apply the retirement rubric** from `docs/AGENTS.md` → Plan retirement and `docs/plans/AGENTS.md` → archive/delete protocols. For each completed plan, classify as:
   - **archive** — preserves durable decision context (non-obvious architecture choice, migration rationale, durable tradeoff, multi-step migration record).
   - **delete** — only execution sequencing; durable facts already live in `architecture.md`, `code-style/AGENTS.md`, `plans/AGENTS.md`, `documentation/`, or code.
   - **fold-then-retire** — durable facts exist but are not yet in a source-of-truth doc. Name the target doc and the snippet to fold in before the move/delete.
   - **keep open** — work not finished, or completion unclear.
   - **carve remainder** — mostly done but a small piece remains; propose a new `open/<concern>.md` for the remainder before retiring the parent.
6. **Report the decisions** as a table before doing any moves: plan path → decision → one-line justification citing the rubric clause. Wait for user approval unless the user has already authorized the moves.
7. **Execute approved actions:**
   - **archive**: `git mv docs/plans/open/<x> docs/plans/archive/<x>`. Preserve filename and folder structure. Do not rewrite to past tense.
   - **delete**: `git rm` the file or folder. Commit message must explain why the durable facts no longer need a plan.
   - **fold-then-retire**: edit the target source-of-truth doc first, then archive or delete per the same-PR rule.
   - **carve remainder**: create the new `open/` plan first, then retire the parent.

## Output format

Default to a single table in the chat reply:

```
| Plan                                  | Status      | Decision         | Justification                                  |
| ------------------------------------- | ----------- | ---------------- | ---------------------------------------------- |
| open/sandbox-auto-revive.md           | shipped     | delete           | Sequencing-only; behavior visible in src/...   |
| open/agent-runtime-decoupling/        | in progress | keep open        | Chunks 03+ not landed                          |
| open/openrouter-model-route-...md     | shipped     | archive          | Captures fallback-policy tradeoff not in arch  |
```

Follow the table with a short "Proposed actions" list of exact `git mv` / `git rm` commands and any required source-of-truth edits.

## Rules of engagement

- **Never delete or move a plan without explicit user approval** in the same session, unless the user invoked this skill with a directive like "archive and commit". Default is propose-then-apply.
- **Drift plans**: do not archive on completion by default — `docs/plans/AGENTS.md` says drift plans are deleted after realignment ships unless they preserve lasting decision context. Flag candidates, do not move them silently.
- **Architecture doc edits**: if a plan's durable facts need to be folded into `architecture.md`, that edit must respect the architecture-changes process in `docs/AGENTS.md` (plan first, then update). For purely descriptive folds (style rule, procedural rule), edit directly.
- **Conflicts checked**: if archival reveals two open plans touching the same area, surface the conflict — do not silently retire one.
- **No bulk sweeps without reading.** Every retirement decision must cite specific evidence from the plan and the current repo state.

## When NOT to use this skill

- Creating or editing a plan → use `/plan` instead.
- Generating drift plans → use `/plan-drift-detection`.
- Single-plan archival the user already decided on — just run the `git mv` / `git rm` directly.
