# Architecture docs

`architecture.md` is the source of truth for how `src/` is organized — top-level layout, direction-of-dependencies rules, `src/lib/<concern>/` folder shape, the "Where to put new code" table, and recent path moves.

## When to read it

- Before adding, moving, or renaming anything under `src/`.
- Before writing or editing a plan in `docs/plans/` (plans must respect the documented rules).
- Before running the `drift-detection` skill — it treats this doc as the contract.

## When to update it

Update `architecture.md` **in the same PR** as the code change whenever you:

- Add, remove, or rename a top-level folder under `src/`.
- Add a new `src/lib/<concern>/` folder, or change a concern's file shape.
- Change a path alias in `tsconfig.json` or `components.json`.
- Move code in a way that invalidates an entry under "Recent moves to be aware of" — add the new entry there.
- Introduce a new dependency direction or relax an existing rule. If the rule is changing intentionally, the doc change is the deliverable; don't let `src/` and the doc disagree.

If a plan needs to break a documented rule, the plan must say so explicitly and update `architecture.md` as part of its execution.

## Style

- This is a reference document, not an instruction set. Keep it descriptive (what exists, what the rules are), not prescriptive narrative.
- Prefer tables, folder trees, and bullet lists over paragraphs.
- Cross-reference by section name so other docs (plans, drift skill) can cite rules unambiguously.
