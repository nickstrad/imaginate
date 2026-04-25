# Code style

Project-wide style rules that the linter / formatter does not enforce. Read before writing or editing code in `src/`. Update this file in the same PR whenever a new rule is agreed.

## Conventions

### Always brace control flow

Every `if` / `else` / `for` / `while` body uses curly braces, including single-statement bodies and early-return guards. No brace-less one-liners.

```ts
// Yes
if (cond) {
  doThing();
}

if (!user) {
  return null;
}

// No
if (cond) doThing();
if (!user) return null;
```

**Why:** prevents the "added a second line, forgot the braces" bug class and keeps every conditional reading uniformly.

## Adding a new rule

- Each rule gets a short heading, a one-line statement, a before/after snippet, and a one-line "Why."
- Rules belong here only if a linter/formatter cannot enforce them. If ESLint, Prettier, or `tsc` can express it, configure the tool instead and link to the config from here.
- Keep examples in the project's primary language (TS) unless the rule is language-specific.
- No exhaustive style essays. If a rule needs more than ~10 lines to explain, it probably belongs in `docs/documentation/` with a pointer from here.

## Out of scope

- Architecture and folder structure → `docs/architecture/architecture.md`.
- Plan authoring conventions → `docs/plans/AGENTS.md`.
- Tooling-enforced formatting (Prettier, ESLint) → respective config files.
