# Docs Folder

Read the root `AGENTS.md` first — it has the `docs/` map, always-load table, and source-of-truth rules. This file only covers what's specific to editing inside `docs/` itself.

## Subfolders not covered by the root map

- `docs/documentation/` — longer-lived references useful while coding (e.g. harness-engineering notes).
- `docs/archive/` — retired material kept only for reference (legacy plans, deprecated skills). Not loaded as guidance for new work.
- `docs/plans/` — ephemeral PRDs, ticket files, and refactor plans written by the `imaginate-workflow-*` skills. Read by those skills, not by hand.

## Editing docs

- Read the subfolder `AGENTS.md` before editing inside it.
- Prefer updating the current source of truth over adding a parallel explanation.
- Cross-link instead of duplicating content.
- Keep docs concise enough that agents will actually load them.

## `CLAUDE.md` ↔ `AGENTS.md` convention

`AGENTS.md` is the source of truth at every level. The sibling `CLAUDE.md` is a symlink to `AGENTS.md` so Claude Code's auto-loaded `CLAUDE.md` resolves to the same content. When adding a new `AGENTS.md`, create the symlink in the same change set: `ln -s AGENTS.md CLAUDE.md`. Never put unique guidance in `CLAUDE.md`.
