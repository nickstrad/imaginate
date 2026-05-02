# Repo agent guide

Entrypoint for any agent (Claude, Codex, etc.) working in this repo. Tells you which docs to read for which task. Read the linked docs — don't guess.

## The `docs/` map

```
docs/
  architecture/   How src/ is organized. Folder shape, dependency direction, where new code goes.
  code-style/     Project-wide style rules a linter/formatter doesn't enforce.
  testing/        Testing criteria, test shape, and verification expectations.
  research/       Agent-oriented research notes that may matter later but are not plans.
  documentation/  Long-form references (e.g. harness-engineering notes).
```

Each subfolder has its own `AGENTS.md`. Read `docs/AGENTS.md` and the relevant subfolder guide before editing inside `docs/`.

## Always-load context

Before doing **any** of the following, load the docs listed:

| Task                                         | Always read first                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Writing or editing code in `src/`            | `docs/architecture/architecture.md` + `docs/code-style/AGENTS.md` + `docs/testing/AGENTS.md` |
| Moving / renaming folders or files in `src/` | `docs/architecture/architecture.md` (update it in the same PR if structure shifts)           |
| Reviewing a PR or simplifying code           | `docs/architecture/architecture.md` + `docs/code-style/AGENTS.md` + `docs/testing/AGENTS.md` |
| Writing tests                                | `docs/architecture/architecture.md` + `docs/testing/AGENTS.md`                               |

Slash commands that write, simplify, or review code (`/simplify`, `/review`, `/security-review`, etc.) follow the same table. `/commit-changes` requires no extra docs, but if the change touches `src/` structure, confirm `architecture.md` was updated in the same change set.

## Local worktrees

Standard workflow for any non-trivial work. Create under the gitignored `worktrees/` folder, then prep:

```bash
git worktree add worktrees/<work-name> -b <work-name>
cp .env worktrees/<work-name>/.env          # opaque copy — do not read or print contents
cd worktrees/<work-name> && npm i
```

Use a short, descriptive `<work-name>` matching the branch.

## Scratch pad for ephemeral artifacts

`scratch_pad/` (repo root, gitignored) is the default for ephemeral agent-generated markdown: branch walkthroughs, manual QA checklists, scratch notes. Use kebab-case filenames; overwrite freely; surface overwrites in the final reply. **Don't** put research notes (→ `docs/research/`), contracts (→ relevant `docs/` subfolder), or anything the user explicitly asked to commit there.

## Doc maintenance rules

- `architecture.md` is a contract for `src/`, not a changelog. Architecture-changing PRs update it (and any lint enforcement) in the same change set. Don't update it to bless an arbitrary code change after the fact.
- Don't duplicate content across docs — cross-link.
- New project-wide rules go in the right doc:
  - Structural rule about `src/` → `docs/architecture/architecture.md`
  - Style rule a linter can't enforce → `docs/code-style/AGENTS.md`
  - Testing or verification expectation → `docs/testing/AGENTS.md`
  - Exploratory / vendor research → `docs/research/`
  - Cross-cutting agent behavior → this file
