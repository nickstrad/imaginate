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

### Avoid `any` — explicit override required

`@typescript-eslint/no-explicit-any` is an error in `eslint.config.mjs`. Do not reach for `any` to silence the type checker. Prefer `unknown` and narrow with a guard, a precise interface, or a generic.

When `any` really is the right call — usually a test fake mimicking only the subset of a third-party return shape the code under test reads, or a deeply convoluted upstream type whose precise shape would cost more than it earns — it must be suppressed explicitly:

```ts
// Yes — explicit, scoped, and explains the trade-off.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake: mimicking only the subset of generateText's return shape that the executor reads.
const fakeGenerateText = (async () => ({ steps: [], text: "" })) as any;

// No — silent any.
const fakeGenerateText = (async () => ({ steps: [], text: "" })) as any;
```

The disable comment must name the rule and include a `-- <reason>` clause. File-wide disables for `no-explicit-any` are not allowed; suppress per occurrence so each one is reviewable.

**Why:** every `any` erases a real type contract and propagates outward. The rule plus the per-line override forces a deliberate, reviewable choice instead of the gradual any-creep that test files in particular are prone to.

## Adding a new rule

- Each rule gets a short heading, a one-line statement, a before/after snippet, and a one-line "Why."
- Rules belong here only if a linter/formatter cannot enforce them. If ESLint, Prettier, or `tsc` can express it, configure the tool instead and link to the config from here.
- Keep examples in the project's primary language (TS) unless the rule is language-specific.
- No exhaustive style essays. If a rule needs more than ~10 lines to explain, it probably belongs in `docs/documentation/` with a pointer from here.

## Out of scope

- Architecture and folder structure → `docs/architecture/architecture.md`.
- Testing criteria and verification expectations → `docs/testing/AGENTS.md`.
- Tooling-enforced formatting (Prettier, ESLint) → respective config files.
