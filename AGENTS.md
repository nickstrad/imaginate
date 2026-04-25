# Repo agent guide

This file is the entrypoint for any agent (Claude, Codex, etc.) working in this repo. It tells you which docs to read for which kind of task. Read the linked docs — don't guess.

## The `docs/` map

```
docs/
  architecture/   How src/ is organized. Folder shape, dependency direction, where new code goes.
  code-style/     Project-wide style rules a linter/formatter doesn't enforce.
  plans/          Planning docs (open/, drift/, completed/) for work spanning >1 PR.
  documentation/  Long-form references (e.g. harness-engineering notes).
```

Each subfolder has its own `AGENTS.md` with the rules that apply when you touch files in it. Read that file before editing inside the folder.

- `docs/architecture/AGENTS.md` — when to read `architecture.md`, when to update it.
- `docs/code-style/AGENTS.md` — current style rules + how to add a new one.
- `docs/plans/AGENTS.md` — plan structure (single-file vs ordered folders), required sections, conflict-check, subfolder lifecycle.

## Always-load context

Before doing **any** of the following, load the docs listed:

| Task                                         | Always read first                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| Writing or editing code in `src/`            | `docs/architecture/architecture.md` + `docs/code-style/AGENTS.md`                       |
| Creating or editing a plan                   | `docs/plans/AGENTS.md` + `docs/architecture/architecture.md` (plans must respect rules) |
| Moving / renaming folders or files in `src/` | `docs/architecture/architecture.md` (and update it in the same PR if structure shifts)  |
| Running drift detection                      | `docs/architecture/architecture.md` + `.claude/skills/drift-detection/SKILL.md`         |
| Reviewing a PR or simplifying code           | `docs/architecture/architecture.md` + `docs/code-style/AGENTS.md`                       |
| Writing tests                                | `docs/architecture/architecture.md` (folder shape includes test colocation rules)       |

## Slash-command context

When invoked via a slash command, load the docs listed under that command **before** doing the work. Treat this as a hard prerequisite, not a suggestion.

- **`/plan`** — read `docs/plans/AGENTS.md`, then `docs/architecture/architecture.md`, then list `docs/plans/open/` and `docs/plans/drift/` for the conflict check. Plans must respect documented architecture and code-style rules; if they need to break a rule, update the corresponding doc in the same PR.
- **`/simplify`** — read `docs/code-style/AGENTS.md` and `docs/architecture/architecture.md`. Simplifications must not violate dependency direction or folder shape; reuse existing concerns under `src/lib/` rather than introducing new abstractions.
- **`/drift-detection`** — the skill at `.claude/skills/drift-detection/SKILL.md` already loads `architecture.md`. Output goes to `docs/plans/drift/` per `docs/plans/AGENTS.md`.
- **`/review`** and **`/security-review`** — read `docs/architecture/architecture.md` and `docs/code-style/AGENTS.md` so review comments cite documented rules instead of taste.
- **`/commit-changes`** — no extra docs required, but if the change touches `src/` structure, confirm `architecture.md` was updated in the same change set before committing.
- **Any other skill that writes code or plans** — default to the "Always-load context" table above.

If a command doesn't appear here, fall back to the table.

## Doc maintenance rules

- `architecture.md` and the code in `src/` must agree. If your change makes one stale, update it in the same PR.
- Plans cite architecture rules by section name. If the rule moves or renames, update the plans that reference it.
- Don't duplicate content across docs. Cross-link instead.
- New project-wide rules go in the right doc:
  - Structural rule about `src/` → `docs/architecture/architecture.md`.
  - Style rule a linter can't enforce → `docs/code-style/AGENTS.md`.
  - Procedural rule about plans → `docs/plans/AGENTS.md`.
  - Cross-cutting agent behavior → this file.
