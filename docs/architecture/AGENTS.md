# Architecture docs

`architecture.md` is the explicit contract for how `src/` is organized — top-level layout, direction-of-dependencies rules, folder shape, the "Where to put new code" table, and mechanically enforced invariants.

## When to read it

- Before adding, moving, or renaming anything under `src/`.

## When to update it

For normal code changes, conform to `architecture.md`; do not rewrite it to bless an arbitrary implementation after the fact.

Update `architecture.md` **deliberately** in the same PR as the architecture-changing code whenever you:

- Add, remove, or rename a top-level folder under `src/`.
- Add a new `src/lib/<concern>/` folder, or change a concern's file shape.
- Change a path alias in `tsconfig.json` or `components.json`.
- Move code in a way that invalidates an entry under "Recent moves to be aware of" — add the new entry there.
- Introduce a new dependency direction or relax an existing rule. If the rule is changing intentionally, ship the doc change in the same change set; don't let `src/` and the doc disagree.

## Style

- This is a reference document, not an instruction set. Keep it descriptive (what exists, what the rules are), not prescriptive narrative.
- Prefer tables, folder trees, and bullet lists over paragraphs.
- Cross-reference by section name so other docs can cite rules unambiguously.
