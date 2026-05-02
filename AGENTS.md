# Repo agent guide

This file is the entrypoint for any agent (Claude, Codex, etc.) working in this repo. It tells you which docs to read for which kind of task. Read the linked docs — don't guess.

## The `docs/` map

```
docs/
  architecture/   How src/ is organized. Folder shape, dependency direction, where new code goes.
  code-style/     Project-wide style rules a linter/formatter doesn't enforce.
  testing/        Opinionated testing criteria, test shape, and verification expectations.
  research/       Agent-oriented research notes from discussions that may matter later but are not plans.
  documentation/  Long-form references (e.g. harness-engineering notes).
```

`docs/` is operational context for agents coding this repo, not a wiki and not a permanent task-history dump. Prefer current source-of-truth docs over stale plan history. Each subfolder has its own `AGENTS.md` with the rules that apply when you touch files in it. Read `docs/AGENTS.md` and the relevant subfolder guide before editing inside `docs/`.

- `docs/AGENTS.md` — docs philosophy, source-of-truth rules, and plan retirement policy.
- `docs/architecture/AGENTS.md` — when to read `architecture.md`, when to update it.
- `docs/code-style/AGENTS.md` — current style rules + how to add a new one.
- `docs/testing/AGENTS.md` — when to add tests, what kind to write, and how to verify changes.
- `docs/research/AGENTS.md` — when to capture exploratory findings that may inform future work but are not source-of-truth contracts or execution plans.

## Local worktrees

**Worktrees are the standard workflow.** Always create a worktree for feature work, bug fixes, and anything that spans more than a single trivial commit. This keeps `main` clean and allows other branches to merge safely without carrying intermediate work.

Create worktrees under the root-level ignored folder:

```txt
/Users/nick/Software/imaginate/worktrees/<work-name>
```

Use a short, descriptive `<work-name>` based on the task, and use the matching `<work-name>` branch name unless the user asks for something else. Keep `worktrees/` ignored; it is a local workspace organization folder, not project content.

After creating a new worktree, copy the repo-root `.env` into it:

```bash
cp /Users/nick/Software/imaginate/.env /Users/nick/Software/imaginate/worktrees/<work-name>/.env
```

Do not read, print, or echo the contents of `.env` — copy the file as opaque bytes. The new worktree needs it to run, and `.env*` is gitignored so it does not propagate via git.

After copying `.env`, install dependencies in the new worktree:

```bash
cd /Users/nick/Software/imaginate/worktrees/<work-name> && npm i
```

Run this once per new worktree; `node_modules/` is not shared across worktrees.

## Scratch pad for ephemeral artifacts

`scratch_pad/` (repo root) is the default destination for ephemeral, agent-generated markdown that is not a source-of-truth doc. The folder is gitignored, so files written there stay local and never ship.

**Write to `scratch_pad/<artifact>.md` for:**

- Branch walkthroughs and change summaries.
- Manual validation / QA checklists.
- Scratch notes, ad-hoc analysis, throwaway diagrams.
- Any one-off markdown the user did not explicitly ask to commit.

**Do NOT write to `scratch_pad/` for:**

- Research notes meant to inform future work → `docs/research/`.
- Architecture / code-style / testing contracts → their `docs/` subfolder.
- Anything the user explicitly asks to commit or ship.

**Defaults when generating a scratch-pad file:**

- Create `scratch_pad/` if it does not exist; do not stage or commit it.
- Use kebab-case filenames that name the artifact (`branch-walkthrough.md`, `manual-validation.md`), optionally prefixed by branch slug or date when collisions are likely.
- Overwrite existing scratch-pad files freely — they are ephemeral. Surface the overwrite in the final reply.
- Do not paste the full generated file back into chat; the file is the deliverable.

## Always-load context

Before doing **any** of the following, load the docs listed:

| Task                                         | Always read first                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Writing or editing code in `src/`            | `docs/architecture/architecture.md` + `docs/code-style/AGENTS.md` + `docs/testing/AGENTS.md` |
| Moving / renaming folders or files in `src/` | `docs/architecture/architecture.md` (and update it in the same PR if structure shifts)       |
| Reviewing a PR or simplifying code           | `docs/architecture/architecture.md` + `docs/code-style/AGENTS.md` + `docs/testing/AGENTS.md` |
| Writing tests                                | `docs/architecture/architecture.md` + `docs/testing/AGENTS.md`                               |

## Slash-command context

When invoked via a slash command, load the docs listed under that command **before** doing the work. Treat this as a hard prerequisite, not a suggestion.

- **`/simplify`** — read `docs/code-style/AGENTS.md`, `docs/testing/AGENTS.md`, and `docs/architecture/architecture.md`. Simplifications must not violate dependency direction or folder shape; place code in the documented layer instead of introducing new abstractions, and preserve meaningful test coverage.
- **`/review`** and **`/security-review`** — read `docs/architecture/architecture.md`, `docs/code-style/AGENTS.md`, and `docs/testing/AGENTS.md` so review comments cite documented rules instead of taste.
- **`/commit-changes`** — no extra docs required, but if the change touches `src/` structure, confirm `architecture.md` was updated in the same change set before committing.
- **Any other skill that writes code** — default to the "Always-load context" table above.

If a command doesn't appear here, fall back to the table.

## `CLAUDE.md` ↔ `AGENTS.md` convention

`AGENTS.md` is the source of truth at every level. The sibling `CLAUDE.md` is a symlink to `AGENTS.md` so Claude Code's auto-loaded `CLAUDE.md` resolves to the AGENTS.md content without duplication or drift. When you add a new `AGENTS.md` (root or any `docs/` subfolder), create the symlink in the same change set:

```bash
ln -s AGENTS.md CLAUDE.md
```

Do not put unique guidance in `CLAUDE.md`; if a rule should apply to Claude, it belongs in `AGENTS.md`.

## Doc maintenance rules

- `architecture.md` is an explicit contract for `src/`, not a changelog. Normal feature PRs conform to it. Architecture-changing PRs update `architecture.md` and any lint enforcement deliberately in the same change set.
- Do not update `architecture.md` merely to bless an arbitrary code change after the fact.
- Don't duplicate content across docs. Cross-link instead.
- New project-wide rules go in the right doc:
  - Structural rule about `src/` → `docs/architecture/architecture.md`.
  - Style rule a linter can't enforce → `docs/code-style/AGENTS.md`.
  - Testing criteria or verification expectations → `docs/testing/AGENTS.md`.
  - Exploratory discussion or vendor/product research → `docs/research/`.
  - Cross-cutting agent behavior → this file.
