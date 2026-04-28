# Plans folder

This folder is the source of truth for proposed and in-flight work that does not fit in a single PR. Read this file before creating or editing a plan so plans stay uniform and discoverable.

## Layout

```
docs/plans/
  open/        Active plans the team intends to execute. New plans go here.
  drift/       Auto-generated realignment plans from the plan-drift-detection skill.
  archive/     Completed plans kept only when they have lasting decision value.
```

Subfolder rules are folded into this file (see "Subfolder rules" below) — there is no per-subfolder AGENTS.md.

## What a plan is

A plan is a written design + sequencing artifact for one **concern or goal**. It is not a ticket, not a TODO list, and not a journal. A plan should give a reader who has never seen the work enough context to:

1. Understand the problem and why it matters (the "issue").
2. See what the change will improve and what success looks like.
3. Picture the end state through concrete examples (snippets, before/after, folder trees).
4. Execute the work in a defensible order.
5. Confirm it does not contradict another plan that is open or queued in `drift/`.

If the work is small enough that a PR description covers it, do not write a plan.

## Single-file vs folder-of-files

Pick the shape that matches the scope. **Most plans should be single files.** Promote to a folder only when the work spans more than ~3 dependent PRs.

- **Single file** (`docs/plans/open/<concern>.md`) — one cohesive change, ships in one or two PRs. Examples in the tree: `cli-local-sandbox.md`, `sandbox-auto-revive.md`, `openrouter-model-route-fallbacks.md`. A folder is **overkill** for these.
- **Folder with ordered chunks** (`docs/plans/open/<concern>/`) — multi-step refactor where each chunk is a separately-reviewable PR.

  ```
  open/<concern>/
    README.md                   Overview, goal, target shape, chunk index, definition of done
    01-<chunk>.md               Full detail (this is the next chunk to ship)
    02-<chunk>.md               Lighter detail (the one after that)
    ...
  ```

  Numbering rules:
  - Two-digit, zero-padded prefixes (`01-`, `02-`, …) so lex order = exec order.
  - The `README.md` is the index: it links every chunk in order and states which chunks can ship together vs. which depend on earlier ones.
  - If you insert a step between `02-` and `03-`, renumber rather than using `02a-`. Renumbering is cheap; chunk filenames are not load-bearing identifiers.

## Detail level: progressive disclosure

Plans are guidance for the **next** coding agent, not a finished spec for the whole journey. Detail decays as you look further out, because later chunks will be wrong by the time you reach them. Match the depth to the distance:

- **Current chunk (the next one to ship):** full detail. Goal, problem, "after" sketch with code/paths, sequencing, definition of done, out of scope. ~200–500 words. This is what the agent reads literally tomorrow.
- **Next chunk (N+1):** lighter file. Goal, what changes and why, what it depends on, rough shape. **No code samples, no exact field lists.** ~100–200 words.
- **Later chunks (N+2+):** **do not write a separate file yet.** List them as one-line bullets in the README's chunk index ("`03-cwd-workspace` — swap default Workspace to cwd"). Promote a stub to a real chunk file only when it becomes the next-to-implement.

The same idea applies inside a single-file plan: the next sub-step gets full detail; later sub-steps stay as one-line bullets in the sequencing section.

After a chunk ships:

1. Delete or archive the shipped chunk file (per the lifecycle rules).
2. Promote the next stub from the README index into a full chunk file.
3. Update the README's "what changes because of …" section if upstream assumptions moved.

**Why this shape:**

- Agents do best with one well-specified next step. Over-specified later steps cause them to implement chunk 3 when you asked for chunk 1.
- Plans rot. Detailed text written today for chunk 5 is throwaway by the time chunk 5 arrives.
- A short index makes drift obvious; a 2000-word chunk file disguises it.

**What stays full-detail at all times:** the README's _Goal_, _What "after" looks like_, _Out of scope_, and _Conflicts checked_ sections. Those survive change and are the cheapest part of the plan to keep current.

## Required sections

Whether a plan is one file or a chunk inside a folder, it should cover the following. Section titles can be adjusted to fit the work, but each idea must be present.

1. **Goal / Overview** — one paragraph: what changes and what payoff that buys.
2. **The problem** — the concrete pain. Cite offending paths (`file:line`) where useful. Reference the architecture doc rule by section name when the plan is correcting an architecture violation.
3. **What "after" looks like** — a sketch of the end state. Prefer before/after snippets, target folder layout, or a small code example over prose. The reader should be able to picture the diff.
4. **Sequencing** — for folder plans, the chunk order with dependency notes. For single-file plans, the order of PRs or sub-steps. Mark anything that can ship in parallel.
5. **Definition of done / Verification** — how we know it landed. Tests added, behavior preserved, telemetry visible, etc. Use `docs/testing/AGENTS.md` for testing criteria and verification expectations.
6. **Out of scope** — what this plan deliberately does not address. Prevents scope creep and forwards the deferred work to a separate plan.
7. **Dependencies & conflicts** — explicit relationships to every other plan in `open/` and `drift/` that touches the same area, expressed as labeled bullets. Use these labels:
   - **Depends on `<plan>`** — this plan assumes the named plan has shipped. Implementation should not start until then. State _what_ it depends on (a port, an event, a column) so a reader can tell when the dependency is satisfied.
   - **Blocks `<plan>`** — the named plan cannot start until this one ships. Reciprocal of "Depends on" — if plan A depends on B, plan B must list A under "Blocks".
   - **Supersedes `<plan>`** — this plan replaces the named plan. Either delete the superseded plan in the same PR or, if a transitional period is needed, mark it superseded inside its own file. Don't leave the old plan in `open/` without a pointer.
   - **Coordinates with `<plan>`** — both plans touch a shared concept (port, schema, file) and must agree, but neither blocks the other. Say _what_ they share and where the boundary is.
   - **No conflict with `<plan>`** — only mention plans worth ruling out (i.e. ones a reasonable reader might assume overlap). Don't list every plan in the folder.

   If there are no other plans in the area, write "No related plans in `open/` or `drift/`." A missing or empty section is a bug — the plan must demonstrate the author surveyed the folder.

## Authoring procedure

Every time you create or substantially edit a plan:

1. **Survey existing plans first.** List `docs/plans/open/` and `docs/plans/drift/` and skim anything that touches the same area. Map the relationships using the labels in "Dependencies & conflicts" above (Depends on / Blocks / Supersedes / Coordinates with / No conflict with). Drift plans are auto-generated; if a drift plan covers part of your work, link it and let it stay as-is — do not delete it.

   **Reciprocal updates are mandatory.** If your new plan declares "Depends on `B`", open `B` and add "Blocks `<your plan>`" in the same change. If you "Supersede `B`", either delete `B` or add a pointer at the top of `B` in the same change. A unilateral dependency claim is a bug — both sides of the relationship must be visible.

2. **Read `docs/architecture/architecture.md` and `docs/testing/AGENTS.md`.** Plans must respect the documented import rules, folder shapes, "Where to put new code" table, testing criteria, and verification expectations. If the plan needs to break a rule, it must update the relevant source-of-truth doc in the same PR and say so explicitly.
3. **Pick single-file vs folder shape** per the rules above.
4. **Write the plan.** Use concrete examples. Reference real paths. Keep it tight — a long plan that no one reads is worse than a short one that gets executed.
5. **Link from the index where applicable.** Folder plans get a `README.md` that lists chunks. Single-file plans do not need a separate index.

## Lifecycle

```
draft → open/ → (work happens, PRs land) → archive/ or delete
                  ↘ if abandoned or no longer useful, delete the file with a commit message that explains why
```

- Drafts can live in a feature branch until the plan is ready for review; merge to main only when the plan is the file you actually intend to execute against.
- Use `.claude/skills/plans-audit/SKILL.md` to audit `open/` plans for both stale in-flight work and completed-plan retirement. The old `/plan-archive` and `/plans-refresh` commands are compatibility aliases for the same audit.
- When all work for a plan has shipped, retire it per the archive-or-delete policy below.
- The drift folder has its own lifecycle — see the `drift/` subsection below.

## Subfolder rules

### `open/`

Active plans the team intends to execute.

- Add to `open/` when the work spans more than a single PR, or when a PR description alone won't carry the context.
- Leave `open/` when all chunks ship (archive or delete per the retirement policy), when the work is abandoned (delete with a commit message explaining why — don't leave dead plans rotting), or when the plan turns out to be drift realignment (move to `drift/`).
- Speculative ideas don't belong here. Use an issue or a comment until the work is intended to happen.

### `drift/`

Realignment plans that bring `src/` back into agreement with `docs/architecture/architecture.md`. Typically generated by the `plan-drift-detection` skill (`.claude/skills/plan-drift-detection/SKILL.md`); hand edits are fine when they tighten an existing plan.

- **Why separate from `open/`.** Different trigger (code drifted from doc vs. new feature), different scope rule (must not exceed the violated rule — drift plans realign, they don't redesign), different authorship (skill-generated, uniform template).
- **Read before authoring an `open/` plan.** If a drift plan covers your area, your open plan must supersede it explicitly or carve around it. Don't ship contradicting plans.
- **Hand-authoring template** — same one the skill uses (see `SKILL.md`):

  ```markdown
  # <Short refactor title>

  ## Overview

  ## How it's out of sync

  ## What "in sync" looks like

  ## Suggested steps
  ```

  Filename: kebab-case naming the **refactor**, not the symptom.

- **Doc-update plans.** If the architecture doc itself is wrong, use caution: `architecture.md` is a contract, not a mirror of arbitrary code. A drift plan may propose updating `architecture.md` only when the code represents an intentional architecture decision that should become the new contract. Otherwise, fix the code to match the doc.
- **Lifecycle.** Drift plans are deleted after the realignment ships unless they preserve lasting decision context worth archiving. Re-running the skill updates an existing file rather than creating duplicates.

### `archive/`

Completed plans with lasting value as decision history. Read-only by convention.

- **Why we keep them.** Keep a shipped plan only when it explains durable context future agents need: why a non-obvious architecture choice exists, migration rationale not captured cleanly in `architecture.md`, or a tradeoff that prevents re-litigating the same path.
- **Archive protocol.** When every chunk's PR is merged and the "definition of done" holds in `main`, first fold durable facts into source-of-truth docs. Then `git mv` the file or folder into `archive/` only if the plan still has lasting value. Preserve its name and internal structure (folder plans keep their `README.md` and numbered chunks). Do not rewrite to past tense — leave it as the design artifact it was; git history records when it shipped.
- **Delete protocol.** Delete completed plans that were only execution sequencing once durable facts live in `architecture.md`, `code-style/AGENTS.md`, `testing/AGENTS.md`, `plans/AGENTS.md`, `documentation/`, or code. Delete abandoned plans with an explanatory commit.
- **What does NOT go here.** Abandoned plans. Completed plans whose only value is task-tracker history. Drift plans that simply realigned code to the existing contract.
- **When to read.** Before authoring a new plan in a related area, to avoid re-litigating decisions already made.

## Architecture contract rule

Plans may propose changing `docs/architecture/architecture.md`, but normal implementation PRs should conform to it. Do not update `architecture.md` merely to bless an arbitrary code change after the fact.

If a plan changes an architecture invariant:

1. Say which rule changes and why.
2. Update `architecture.md` in the chunk that changes the invariant.
3. Add or update lint rules when the invariant can be enforced mechanically.
4. Keep plan text and architecture text in sync.

## Style rules

- Kebab-case filenames that name the **concern**, not the symptom: `agent-runtime-decoupling.md`, not `fix-agent-bug.md`.
- Prefer code blocks, folder trees, and before/after diffs over paragraphs.
- Reference architecture rules by section name (e.g. "Direction of dependencies") so a reviewer can cross-check against `docs/architecture/architecture.md`.
- Plans describe intent, not history. When a plan is partially executed, update it to reflect what is left, do not append a changelog inside the file — git history covers that.
- Do not duplicate content that lives in `architecture.md`. Link to it.
