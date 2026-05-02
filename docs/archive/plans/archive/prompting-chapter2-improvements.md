# Improve prompting (Chapter 2 insights) + relocate prompts to `lib`

## Context

Chapter 2 of _Harness Engineering_ argues that a system prompt is not personality — it is the control plane. Three takeaways relevant to imaginate:

1. **Layered, not monolithic.** Prompts should be assembled from named sections with explicit precedence (identity → system rules → engineering rules → dynamic context), not one long string.
2. **Static vs dynamic separation for cache cost.** Claude Code splits prompt sections into cacheable vs cache-breaking, and places turn-stable content before per-turn content. Mixing them "burns cache."
3. **Prompt is institutional, not decorative.** Customization (overrides/appends) goes through a fixed assembly function so structure is preserved.

Imaginate's current prompt code (`src/prompts/prompts.ts`) is mostly already static-first / dynamic-last (good — `buildExecutorSystemPrompt` appends `planSnippet` after the base). But:

- All prompts live in one flat file at `src/prompts/`, outside the canonical `src/lib/`.
- Sections aren't named or labeled — there's no explicit "static vs dynamic boundary."
- No prompt caching is wired up. OpenRouter passes through Anthropic `cache_control` via the AI SDK's `providerOptions.anthropic` / `openrouter` — currently unused.
- Inline system prompt for project naming (`src/modules/projects/server/procedures.ts:18-37`) is buried in business logic.
- `EXECUTOR_PROMPT_BASE` mixes identity, environment, workflow, and rules in one block — hard to override or extend cleanly.

The user also asked to move `src/prompts/` into `src/lib/`.

## Goals

1. Relocate `src/prompts/` → `src/lib/prompts/`, splitting `prompts.ts` into named section files.
2. Introduce a small layered-assembly helper so every prompt is built `static_base + dynamic_tail`, with the cache boundary explicit.
3. Enable prompt caching on OpenRouter via `providerOptions` for the static base.
4. Pull the inline naming prompt into the new lib.

Non-goals: rewriting prompt copy, changing planner/executor logic, multi-turn caching of message history (separate effort).

## Plan

### 1. Move and split: `src/prompts/` → `src/lib/prompts/`

New structure:

```
src/lib/prompts/
  index.ts                 # re-exports
  sections.ts              # named string constants (identity, env, workflow, rules, …)
  assemble.ts              # buildSystemPrompt({ base, dynamic }) helper
  planner.ts               # PLANNER_PROMPT (pure static)
  executor.ts              # EXECUTOR_PROMPT_BASE + buildExecutorSystemPrompt
  ask.ts                   # ASK_AGENT_PROMPT (pure static)
  naming.ts                # PROJECT_NAMING_PROMPT (moved from procedures.ts)
  legacy.ts                # AGENT_PROMPT, RESPONSE_PROMPT, FRAGMENT_TITLE_PROMPT (DELETE THIS)
```

`legacy.ts`: the agent confirmed `AGENT_PROMPT`, `RESPONSE_PROMPT`, `FRAGMENT_TITLE_PROMPT` are not referenced. Delete them rather than carry dead code.

### 2. Sectioned assembly (`assemble.ts`)

Expose one helper that enforces the static-before-dynamic invariant:

```ts
// src/lib/prompts/assemble.ts
export type PromptSection = { name: string; content: string };

export function buildSystemPrompt(args: {
  base: PromptSection[]; // static, cache-stable — concatenated in order
  dynamic?: PromptSection[]; // per-call — appended after a hard boundary
}): { system: string; cacheBoundaryIndex: number } {
  const staticPart = args.base.map((s) => s.content.trim()).join("\n\n");
  const boundary = staticPart.length;
  const dyn = (args.dynamic ?? []).map((s) => s.content.trim()).join("\n\n");
  const system = dyn ? `${staticPart}\n\n---\n\n${dyn}` : staticPart;
  return { system, cacheBoundaryIndex: boundary };
}
```

The `---` delimiter is a visible marker for the cache split. `cacheBoundaryIndex` is exported so callers using Anthropic-native caching can mark the breakpoint.

### 3. Refactor `EXECUTOR_PROMPT_BASE` into named sections

Split the 28-line block into:

- `EXEC_IDENTITY` — "You are a senior software engineer in sandboxed Next.js 15.3.3."
- `EXEC_WORKFLOW` — INSPECT → MODIFY → VERIFY → FINALIZE
- `EXEC_TOOLS` — tool catalog
- `EXEC_ENV_RULES` — paths, package.json, dev server, Tailwind-only, "use client"
- `EXEC_FINALIZE_RULES` — finalize tool contract + fallback `<task_summary>`

`buildExecutorSystemPrompt(planSnippet)` becomes:

```ts
return buildSystemPrompt({
  base: [
    EXEC_IDENTITY,
    EXEC_WORKFLOW,
    EXEC_TOOLS,
    EXEC_ENV_RULES,
    EXEC_FINALIZE_RULES,
  ],
  dynamic: [{ name: "plan", content: `Plan from planner:\n${planSnippet}` }],
}).system;
```

This preserves the existing wire format (one system string) while making the cache-stable region explicit. Static order = identity → rules → tools → env → finalize. Dynamic = plan only.

### 4. Wire prompt caching through the AI SDK

In `src/inngest/functions.ts` at the executor and planner `generateText` calls (lines ~209 and ~135), pass `providerOptions` so the static prefix is cached:

```ts
generateText({
  model,
  system: systemPrompt,
  messages,
  tools,
  providerOptions: {
    openrouter: { cacheControl: { type: "ephemeral" } },
    anthropic: { cacheControl: { type: "ephemeral" } },
  },
});
```

OpenRouter forwards `cache_control` to Anthropic-family models and supports the same hint for Gemini implicit caching. The AI SDK passes `providerOptions` straight through. Document this once in `src/lib/prompts/index.ts` as `CACHE_PROVIDER_OPTIONS` so all callsites import the same value.

Verify with one real run: log `providerMetadata` from the SDK response — Anthropic returns `cache_creation_input_tokens` / `cache_read_input_tokens`. If `cache_read_input_tokens > 0` on the second call, caching is live.

### 5. Move project-naming prompt out of the procedure

`src/modules/projects/server/procedures.ts:18-37` has an inline system string. Move to `src/lib/prompts/naming.ts` as `PROJECT_NAMING_PROMPT`. The procedure imports it. User content stays as `prompt: userPrompt.slice(0, 2000)` — that's correctly the dynamic side.

### 6. Update all import sites

Affected files:

- `src/inngest/functions.ts` — imports `PLANNER_PROMPT`, `buildExecutorSystemPrompt`, `ASK_AGENT_PROMPT`. Update path from `@/prompts/prompts` to `@/lib/prompts`.
- `src/modules/projects/server/procedures.ts` — import `PROJECT_NAMING_PROMPT`.
- Any other importer of `src/prompts/prompts` — `grep` confirms one or two usages, update them.
- `tsconfig.json` path aliases: `@/prompts/*` may need to be removed if it exists; `@/lib/*` already maps correctly.

### 7. What we are _not_ changing

- Prompt copy / wording. Chapter 2 is about structure, not language — preserve current behavior.
- Message-history strategy in `getPreviousMessages` (`src/inngest/model-factory.ts:86`). Caching last-N messages is a separate problem (history changes every turn, so it goes after the static base anyway).
- The escalation ladder. Switching models invalidates cache by definition; this is fine.

## Critical files

- `src/prompts/prompts.ts` → split & moved
- `src/lib/prompts/{index,sections,assemble,planner,executor,ask,naming}.ts` → new
- `src/inngest/functions.ts:135,209,641` → update imports + add `providerOptions`
- `src/modules/projects/server/procedures.ts:18-37` → import naming prompt, drop inline
- `tsconfig.json` → path alias check

## Verification

1. `npx tsc --noEmit` — clean.
2. `npm test` (vitest is configured per recent commits) — existing tests pass.
3. End-to-end: run a code-mode request via the dev server, then a second similar request. Inspect Inngest run logs for `providerMetadata`; confirm `cache_read_input_tokens > 0` on the second run for the executor call.
4. End-to-end: run an ask-mode request. Confirm response unchanged.
5. End-to-end: create a new project. Confirm name still generated (naming prompt path).
6. `grep -r "from.*prompts/prompts" src/` returns nothing — old path fully removed.
