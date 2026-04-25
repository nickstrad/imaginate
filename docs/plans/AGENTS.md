# Plans folder

This folder is the source of truth for proposed and in-flight work that does not fit in a single PR. Read this file before creating or editing a plan so plans stay uniform and discoverable.

## Layout

```
docs/plans/
  open/        Active plans the team intends to execute. New plans go here.
  drift/       Auto-generated realignment plans from the drift-detection skill.
  completed/   Plans whose work has shipped. Moved here from open/ at the end.
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

Pick the shape that matches the scope:

- **Single file** (`docs/plans/open/<concern>.md`) — one cohesive change, ships in one or two PRs. Examples already in the tree: `inngest-reliability-refactor.md`, `sandbox-auto-revive.md`, `messages-container-tests.md`.
- **Folder with ordered chunks** (`docs/plans/open/<concern>/`) — multi-step refactor where each chunk is a separately-reviewable PR. Required when a concern has more than ~3 dependent steps. Use a numeric prefix on every chunk file so file order matches execution order:

  ```
  open/<concern>/
    README.md                   Overview, goal, target shape, chunk index, definition of done
    01-<chunk>.md
    02-<chunk>.md
    ...
  ```

  Numbering rules:
  - Two-digit, zero-padded prefixes (`01-`, `02-`, …) so lex order = exec order.
  - The `README.md` is the index: it links every chunk in order and states which chunks can ship together vs. which depend on earlier ones.
  - If you insert a step between `02-` and `03-`, renumber rather than using `02a-`. Renumbering is cheap; chunk filenames are not load-bearing identifiers.

  Existing examples: `open/agent-runtime-decoupling/`, `open/testability-refactor/`.

## Required sections

Whether a plan is one file or a chunk inside a folder, it should cover the following. Section titles can be adjusted to fit the work, but each idea must be present.

1. **Goal / Overview** — one paragraph: what changes and what payoff that buys.
2. **The problem** — the concrete pain. Cite offending paths (`file:line`) where useful. Reference the architecture doc rule by section name when the plan is correcting an architecture violation.
3. **What "after" looks like** — a sketch of the end state. Prefer before/after snippets, target folder layout, or a small code example over prose. The reader should be able to picture the diff.
4. **Sequencing** — for folder plans, the chunk order with dependency notes. For single-file plans, the order of PRs or sub-steps. Mark anything that can ship in parallel.
5. **Definition of done / Verification** — how we know it landed. Tests added, behavior preserved, telemetry visible, etc.
6. **Out of scope** — what this plan deliberately does not address. Prevents scope creep and forwards the deferred work to a separate plan.
7. **Conflicts checked** — a one-line note that you read the rest of `open/` and `drift/` and confirmed no other plan touches the same files/concepts, or names the plan it overlaps with and how the overlap is resolved.

## Authoring procedure

Every time you create or substantially edit a plan:

1. **Survey existing plans first.** List `docs/plans/open/` and `docs/plans/drift/` and skim anything that touches the same area. If there is overlap, either fold the new work into the existing plan or call out the boundary in the new plan's "Conflicts checked" section. Drift plans are auto-generated; if a drift plan covers part of your work, link it and let it stay as-is — do not delete it.
2. **Read `docs/architecture/architecture.md`.** Plans must respect the documented import rules, folder shapes, and "Where to put new code" table. If the plan needs to break a rule, it must update the architecture doc in the same PR and say so explicitly.
3. **Pick single-file vs folder shape** per the rules above.
4. **Write the plan.** Use concrete examples. Reference real paths. Keep it tight — a long plan that no one reads is worse than a short one that gets executed.
5. **Link from the index where applicable.** Folder plans get a `README.md` that lists chunks. Single-file plans do not need a separate index.

## Lifecycle

```
draft → open/ → (work happens, PRs land) → completed/
                  ↘ if abandoned, delete the file with a commit message that explains why
```

- Drafts can live in a feature branch until the plan is ready for review; merge to main only when the plan is the file you actually intend to execute against.
- When all work for a plan has shipped, move the file (or folder) to `completed/` per the move protocol below.
- The drift folder has its own lifecycle — see the `drift/` subsection below.

## Subfolder rules

### `open/`

Active plans the team intends to execute.

- Add to `open/` when the work spans more than a single PR, or when a PR description alone won't carry the context.
- Leave `open/` when all chunks ship (move to `completed/`), when the work is abandoned (delete with a commit message explaining why — don't leave dead plans rotting), or when the plan turns out to be drift realignment (move to `drift/`).
- Speculative ideas don't belong here. Use an issue or a comment until the work is intended to happen.

### `drift/`

Realignment plans that bring `src/` back into agreement with `docs/architecture/architecture.md`. Typically generated by the `drift-detection` skill (`.claude/skills/drift-detection/SKILL.md`); hand edits are fine when they tighten an existing plan.

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

- **Doc-update plans.** If the architecture doc itself is what's wrong (real intentional structure the doc doesn't describe), the drift plan proposes updating `architecture.md` and lives here until that doc update lands.
- **Lifecycle.** Drift plans move to `completed/` like any other plan once the realignment ships. Re-running the skill updates an existing file rather than creating duplicates.

### `completed/`

Archive of plans whose work has fully shipped. Read-only by convention.

- **Why we keep them.** Context for future plans, and a reviewable record of why current code looks the way it does.
- **Move protocol.** When every chunk's PR is merged and the "definition of done" holds in `main`: `git mv` the file or folder into `completed/`, preserving its name and internal structure (folder plans keep their `README.md` and numbered chunks). Do not rewrite to past tense — leave it as the design artifact it was; git history records when it shipped. If a small piece was deferred, carve it into a new `open/` plan before moving the rest.
- **What does NOT go here.** Abandoned plans (delete with an explanatory commit). Drift plans whose underlying rule was changed instead of the code (those should have been rewritten or deleted as part of the doc update).
- **When to read.** Before authoring a new plan in a related area, to avoid re-litigating decisions already made.

## Style rules

- Kebab-case filenames that name the **concern**, not the symptom: `agent-runtime-decoupling.md`, not `fix-agent-bug.md`.
- Prefer code blocks, folder trees, and before/after diffs over paragraphs.
- Reference architecture rules by section name (e.g. "Direction of dependencies") so a reviewer can cross-check against `docs/architecture/architecture.md`.
- Plans describe intent, not history. When a plan is partially executed, update it to reflect what is left, do not append a changelog inside the file — git history covers that.
- Do not duplicate content that lives in `architecture.md`. Link to it.
