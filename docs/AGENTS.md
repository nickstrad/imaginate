# Docs Folder

`docs/` exists to help agents and humans code this repo without needing a separate task tracker. Treat it as operational context: current contracts and durable references that make the next code change safer.

It is not a wiki, changelog, or graveyard for every completed task. If a doc does not help future agents make correct coding decisions, it probably should be deleted, folded into a source-of-truth doc, or moved to a more durable home outside `docs/`.

## Source-of-truth model

- `docs/architecture/architecture.md` is the contract for how `src/` is organized. It should be explicit and deliberate, especially when lint rules enforce architectural invariants.
- `docs/code-style/AGENTS.md` holds human style rules that tooling does not enforce.
- `docs/testing/AGENTS.md` holds testing criteria, test-shape guidance, and verification expectations for code changes.
- `docs/research/` holds agent-oriented research notes from discussions that may be useful later but are not contracts or requirements.
- `docs/documentation/` holds longer-lived references that are useful while coding.
- `docs/archive/` holds retired material kept only for reference (e.g. legacy plans and the skills that supported them). It is not loaded as guidance for new work.

## Architecture changes

Architecture docs are contracts, not after-the-fact descriptions of arbitrary PRs.

For normal code changes, follow `docs/architecture/architecture.md`.

For architecture changes, update `architecture.md` in the same change set that changes the invariant, and add or update lint rules when the invariant can be enforced mechanically. Do not update `architecture.md` just to make an unplanned code change look valid.

## Editing docs

- Read the subfolder `AGENTS.md` before editing inside a docs subfolder.
- Prefer updating the current source of truth over adding a parallel explanation.
- Cross-link instead of duplicating content.
- Keep docs concise enough that agents will actually load and use them.
