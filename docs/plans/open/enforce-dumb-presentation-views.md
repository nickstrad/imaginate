# Enforce dumb presentation views with lint

## Goal

Mechanically enforce the "dumb views vs. smart containers" rule under `src/features/<domain>/presentation/` so views and components stay free of data-fetching, routing, and side-effect imports. The rule is currently documented in `architecture.md` (see "`presentation/` layout: dumb views vs. containers") but is not enforced by `eslint-plugin-boundaries` or `no-restricted-imports`. An agent or human who ignores the doc gets no signal until code review.

## The problem

`docs/architecture/architecture.md` says:

- `presentation/components/` and `presentation/.../views/` are **dumb**: props-in, JSX-out, no data fetching.
- `presentation/.../containers/` are **smart**: may use `useTRPC`, react-query, routing, toasts.

Today this is a code-review contract only. Concrete gaps:

- `eslint.config.mjs` has one element type per layer (`features`, etc.) but does not subdivide `features/` into view vs. container slices, so the boundaries plugin can't forbid container-only imports inside views.
- `no-restricted-imports` is not configured for the view subtree, so `@tanstack/react-query`, `@/platform/trpc-client`, and `next/navigation` can be imported from a view file with zero lint feedback.
- The recent `interfaces/trpc/components/ → features/<domain>/presentation/.../containers/` migration created the first set of containers in the codebase. Without enforcement, the next agent adding a tRPC-backed page is just as likely to inline data fetching into the dumb view as to add a sibling container — re-introducing the exact drift we just removed.

## What "after" looks like

### New element types in `eslint-plugin-boundaries`

Two new sub-elements of `features`, ordered before the generic `features` element so the plugin classifies them first:

```js
// eslint.config.mjs (sketch)
const boundaryElements = [
  // …agent layers, interfaces…
  {
    type: "feature-view",
    pattern: "src/features/*/presentation/**/components/**",
  },
  { type: "feature-view", pattern: "src/features/*/presentation/**/views/**" },
  {
    type: "feature-container",
    pattern: "src/features/*/presentation/**/containers/**",
  },
  { type: "features", pattern: "src/features/**" }, // generic fallback (application/, adapters/, index.ts)
  // …platform, ui, shared, generated…
];
```

Allow-lists:

- `feature-container` — same outbound permissions today's `features` rule has (`features`, `agent-application`, `agent-ports`, `platform`, `platform-trpc-client`, `ui`, `shared`, `generated`, plus `feature-view` and `feature-container`).
- `feature-view` — strictly narrower: `feature-view`, `ui`, `shared`, `generated`. **No** `platform-trpc-client`, **no** `features` (avoid view-to-container leakage), **no** `agent-*`.

### `no-restricted-imports` overlay for npm packages

`eslint-plugin-boundaries` only governs intra-`src/` imports. Forbid the data-fetching/routing packages inside views with `no-restricted-imports`:

```js
// eslint.config.mjs override block
{
  files: [
    "src/features/*/presentation/**/components/**/*.{ts,tsx}",
    "src/features/*/presentation/**/views/**/*.{ts,tsx}",
  ],
  rules: {
    "no-restricted-imports": ["error", {
      paths: [
        { name: "@tanstack/react-query", message: "Dumb views must not fetch data. Move data wiring to a sibling containers/ file." },
        { name: "next/navigation",       message: "Dumb views must not route. Move navigation to a sibling containers/ file." },
        { name: "sonner",                message: "Dumb views must not toast. Surface errors via props from the container." },
      ],
      patterns: [
        { group: ["@/platform/trpc-client", "@/platform/trpc-client/*"], message: "Dumb views must not call useTRPC. Move data wiring to a sibling containers/ file." },
      ],
    }],
  },
},
```

### `architecture.md` update

The "Lint enforcement" section currently lists `platform-trpc-client` as the only sub-element. Add `feature-view` and `feature-container`, and remove the "intentionally not yet wired" disclaimer from the `presentation/` layout section.

## Sequencing

Single PR. Steps in order:

1. **Audit existing views.** Grep `src/features/*/presentation/**/components/` and `.../views/` for `useTRPC`, `@tanstack/react-query`, `next/navigation`, `sonner`. Fix any violations by moving the fetch/route/toast into the sibling container, or by passing the data and callbacks in as props.
2. **Add `feature-view` / `feature-container` element types** to `eslint.config.mjs` with the allow-lists above.
3. **Add the `no-restricted-imports` override block** for the view file globs.
4. **Run `npx eslint src` until clean.** Any errors that survive step 1 indicate a missed violation; fix them, do not relax the rule.
5. **Update `docs/architecture/architecture.md`:** add the two new element types to the "Lint enforcement" paragraph; delete the trailing "intentionally not yet wired" sentence at the end of the "`presentation/` layout: dumb views vs. containers" subsection.
6. **Run typecheck, lint, tests, `next build`.** Confirm no regressions.

## Definition of done

- `eslint.config.mjs` declares `feature-view` and `feature-container` element types and the `no-restricted-imports` override.
- `npx eslint src` passes on `main`.
- A deliberate violation (e.g. adding `import { useTRPC } from "@/platform/trpc-client"` to a file under `presentation/components/`) produces an actionable lint error that names the rule.
- `architecture.md` reflects the enforced state (no "not yet wired" disclaimer).
- `npm test` and `next build` still pass.

## Out of scope

- Splitting existing fat container files (e.g. `messages-container.tsx`) into a dumb `messages-view` plus a thinner container. The container-vs-view enforcement does not require that split; do it as a separate ergonomics plan if and when the container hurts to maintain.
- Enforcing the rule on `app/` route components (Next.js Server Components legitimately fetch data, so the `presentation/` rule does not apply there).
- Subdividing `ui/` into smart vs. dumb (`ui/` is already prohibited from importing platform/features and is implicitly dumb).

## Dependencies & conflicts

- **No conflict with** `agent-telemetry-refactor/`, `openrouter-model-route-fallbacks.md`, `sandbox-auto-revive.md`, `agent-harness-transport-agnostic/`, `cli-ink-app/`, or `cli-local-sandbox.md` — none touch `features/*/presentation/` or `eslint.config.mjs` boundaries config.
- `docs/plans/drift/` — empty.
