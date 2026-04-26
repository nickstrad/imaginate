# Repo agent guide

This file is the entrypoint for any agent (Claude, Codex, etc.) working in this repo. It tells you which docs to read for which kind of task. Read the linked docs — don't guess.

## The `docs/` map

```
docs/
  architecture/   How src/ is organized. Folder shape, dependency direction, where new code goes.
  code-style/     Project-wide style rules a linter/formatter doesn't enforce.
  testing/        Opinionated testing criteria, test shape, and verification expectations.
  plans/          Planning docs (open/, drift/, archive/) for work spanning >1 PR.
  documentation/  Long-form references (e.g. harness-engineering notes).
```

`docs/` is operational context for agents coding this repo, not a wiki and not a permanent task-history dump. Prefer current source-of-truth docs over stale plan history. Each subfolder has its own `AGENTS.md` with the rules that apply when you touch files in it. Read `docs/AGENTS.md` and the relevant subfolder guide before editing inside `docs/`.

- `docs/AGENTS.md` — docs philosophy, source-of-truth rules, and plan retirement policy.
- `docs/architecture/AGENTS.md` — when to read `architecture.md`, when to update it.
- `docs/code-style/AGENTS.md` — current style rules + how to add a new one.
- `docs/testing/AGENTS.md` — when to add tests, what kind to write, and how to verify changes.
- `docs/plans/AGENTS.md` — plan structure (single-file vs ordered folders), required sections, conflict-check, subfolder lifecycle.

## Always-load context

Before doing **any** of the following, load the docs listed:

| Task                                         | Always read first                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Writing or editing code in `src/`            | `docs/architecture/architecture.md` + `docs/code-style/AGENTS.md` + `docs/testing/AGENTS.md` |
| Creating or editing a plan                   | `docs/plans/AGENTS.md` + `docs/architecture/architecture.md` + `docs/testing/AGENTS.md`      |
| Moving / renaming folders or files in `src/` | `docs/architecture/architecture.md` (and update it in the same PR if structure shifts)       |
| Running drift detection                      | `docs/architecture/architecture.md` + `.claude/skills/plan-drift-detection/SKILL.md`         |
| Reviewing a PR or simplifying code           | `docs/architecture/architecture.md` + `docs/code-style/AGENTS.md` + `docs/testing/AGENTS.md` |
| Writing tests                                | `docs/architecture/architecture.md` + `docs/testing/AGENTS.md`                               |

## Slash-command context

When invoked via a slash command, load the docs listed under that command **before** doing the work. Treat this as a hard prerequisite, not a suggestion.

- **`/plan`** — read `docs/plans/AGENTS.md`, then `docs/architecture/architecture.md`, then `docs/testing/AGENTS.md`, then list `docs/plans/open/` and `docs/plans/drift/` for the conflict check. Plans must respect documented architecture, code-style, and testing rules; if they need to break a rule, update the corresponding doc in the same PR.
- **`/simplify`** — read `docs/code-style/AGENTS.md`, `docs/testing/AGENTS.md`, and `docs/architecture/architecture.md`. Simplifications must not violate dependency direction or folder shape; place code in the documented layer instead of introducing new abstractions, and preserve meaningful test coverage.
- **`/plan-drift-detection`** — the skill at `.claude/skills/plan-drift-detection/SKILL.md` already loads `architecture.md`. Output goes to `docs/plans/drift/` per `docs/plans/AGENTS.md`.
- **`/plans-audit`** — the skill at `.claude/skills/plans-audit/SKILL.md` loads `docs/AGENTS.md`, `docs/plans/AGENTS.md`, `architecture.md`, `code-style/AGENTS.md`, and `testing/AGENTS.md`, then audits each open plan against the **current codebase**, the **source-of-truth docs**, and the **other open plans**. It covers both completed-plan retirement and stale/in-flight plan maintenance, proposing decisions such as keep, shrink, salvage-and-merge, supersede, carve remainder, fold-then-retire, archive, or delete.
- **`/plan-archive`** and **`/plans-refresh`** — compatibility aliases for `/plans-audit`. Use the same merged skill rather than separate archive vs. refresh workflows.
- **`/review`** and **`/security-review`** — read `docs/architecture/architecture.md`, `docs/code-style/AGENTS.md`, and `docs/testing/AGENTS.md` so review comments cite documented rules instead of taste.
- **`/commit-changes`** — no extra docs required, but if the change touches `src/` structure, confirm `architecture.md` was updated in the same change set before committing.
- **Any other skill that writes code or plans** — default to the "Always-load context" table above.

If a command doesn't appear here, fall back to the table.

## Doc maintenance rules

- `architecture.md` is an explicit contract for `src/`, not a changelog. Normal feature PRs conform to it. Architecture-changing PRs must be planned first, then update `architecture.md` and any lint enforcement deliberately in the same change set.
- Do not update `architecture.md` merely to bless an arbitrary code change after the fact. If code needs to violate or change the documented architecture, create or update a plan first.
- Plans cite architecture rules by section name. If the rule moves or renames, update the plans that reference it.
- Don't duplicate content across docs. Cross-link instead.
- New project-wide rules go in the right doc:
  - Structural rule about `src/` → `docs/architecture/architecture.md`.
  - Style rule a linter can't enforce → `docs/code-style/AGENTS.md`.
  - Testing criteria or verification expectations → `docs/testing/AGENTS.md`.
  - Procedural rule about plans → `docs/plans/AGENTS.md`.
  - Cross-cutting agent behavior → this file.
