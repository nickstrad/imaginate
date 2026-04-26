# Docs Folder

`docs/` exists to help agents and humans code this repo without needing a separate task tracker. Treat it as operational context: current contracts, active plans, and durable references that make the next code change safer.

It is not a wiki, changelog, or graveyard for every completed task. If a doc does not help future agents make correct coding decisions, it probably should be deleted, folded into a source-of-truth doc, or moved to a more durable home outside `docs/`.

## Source-of-truth model

- `docs/architecture/architecture.md` is the contract for how `src/` is organized. It should be explicit and deliberate, especially when lint rules enforce architectural invariants.
- `docs/code-style/AGENTS.md` holds human style rules that tooling does not enforce.
- `docs/testing/AGENTS.md` holds testing criteria, test-shape guidance, and verification expectations for code changes.
- `docs/plans/open/` holds active multi-PR work the team intends to execute.
- `docs/plans/drift/` holds narrow realignment plans when code and `architecture.md` disagree.
- `docs/plans/archive/` holds only completed plans with lasting value as decision history.
- `docs/documentation/` holds longer-lived references that are useful while coding.

## Architecture changes

Architecture docs are contracts, not after-the-fact descriptions of arbitrary PRs.

For normal code changes, follow `docs/architecture/architecture.md`.

For architecture changes:

1. Create or update an open plan first.
2. Explain which architecture rule changes and why.
3. Update `architecture.md` in the implementation chunk that changes the invariant.
4. Add or update lint rules when the invariant can be enforced mechanically.
5. Keep plan text, architecture text, and lint behavior in sync.

Do not update `architecture.md` just to make an unplanned code change look valid.

## Plan retirement

When a plan finishes, do not automatically keep it.

Use `.claude/skills/plans-audit/SKILL.md` for open-plan maintenance, including stale-plan refreshes and completed-plan retirement. `/plan-archive` and `/plans-refresh` are aliases for that merged audit workflow, not separate lifecycle policies.

Archive a completed plan only when it preserves lasting context that future agents need, such as:

- Why a non-obvious architecture choice exists.
- A migration rationale that is not captured cleanly in `architecture.md`.
- A durable tradeoff, constraint, or decision that affects future work.
- A multi-step migration record that prevents re-litigating the same path.

Delete a completed plan when it was only execution sequencing and the durable facts now live in source-of-truth docs or code.

Fold content into the right source of truth before retiring a plan:

- Structural facts about `src/` go to `docs/architecture/architecture.md`.
- Style conventions go to `docs/code-style/AGENTS.md`.
- Testing criteria and verification expectations go to `docs/testing/AGENTS.md`.
- Procedural plan rules go to `docs/plans/AGENTS.md`.
- Long-lived reference material goes to `docs/documentation/`.

If a small piece remains unfinished, carve it into a new `docs/plans/open/` plan before deleting or archiving the completed plan.

## Editing docs

- Read the subfolder `AGENTS.md` before editing inside a docs subfolder.
- Prefer updating the current source of truth over adding a parallel explanation.
- Cross-link instead of duplicating content.
- Keep docs concise enough that agents will actually load and use them.
