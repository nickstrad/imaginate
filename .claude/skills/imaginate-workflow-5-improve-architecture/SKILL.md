---
name: imaginate-workflow-5-improve-architecture
description: ONLY invoke when the user types `/imaginate-workflow-5-improve-architecture` or explicitly names this skill. Do NOT auto-trigger on phrases like "improve architecture", "refactor", or "fix shallow modules" — the user controls when this step runs so they can batch the workflow. Scans for shallow modules and proposes `imaginate-`-prefixed deep modules; output is a refactor plan at `docs/plans/architecture-<date>.md`.
---

# Improve Codebase Architecture

Find shallow modules and propose deep-module replacements. A _shallow_ module exposes a wide surface for the small amount of work it actually does (lots of named exports, lots of cross-imports, hard to test in isolation). A _deep_ module exposes a small interface but hides substantial functionality behind it — easy to wrap in a single test boundary.

## Procedure

1. **Read the architecture contract.** `docs/architecture/architecture.md` is the source of truth for folder shape and dependency direction. Any proposal must respect it; if the contract itself is the problem, surface that to the user as a separate question rather than silently proposing a contract change.
2. **Scan for shallow-module signals.** Look for:
   - Folders where every file is < ~50 lines and most exports are re-imported by 3+ siblings.
   - Cycle-prone groups (A imports from B, B from C, C from A's neighbor).
   - Files whose primary role is to re-export from another file ("barrel" files with no logic).
   - Tests that have to mock five sibling modules to exercise one function — that's the giveaway that the unit under test has no real boundary.
3. **Group candidates into proposed deep modules.** Each candidate gets:
   - **Proposed name:** `imaginate-<purpose>` (e.g. `imaginate-step-runner`, `imaginate-config-loader`). The prefix is a hard rule — every deep module the agent proposes is `imaginate-`-prefixed for grep-ability.
   - **What it consumes:** files folded into the new module.
   - **What it exposes:** the small public interface (3–7 exports max). If you can't get under 7, the boundary is wrong.
   - **Test boundary:** the single seam at which the new module can be tested without mocking siblings.
4. **Write the plan** to `docs/plans/architecture-<date>.md` with this shape:

   ```markdown
   # Architecture refactor — <date>

   ## Shallow modules identified

   <bulleted list with file paths and the shallow-signal that flagged each>

   ## Proposed deep modules

   ### imaginate-<name>

   - **Folds in:** <files>
   - **Public surface:** <function/type list>
   - **Test boundary:** <seam>
   - **Migration:** <one paragraph: how callers update>

   ## Out of scope

   <modules considered and intentionally not refactored, with reason>
   ```

5. **Do not make code changes.** This skill produces a plan only. The user reviews it; if accepted, the work becomes tracer-bullet tickets via `tracer-bullets` against the plan, then `ralph-loop` executes them.
6. **Report back** the path to the plan and the count of proposed deep modules. Do not paste the plan body into chat.

## Anti-patterns

- Don't propose deep modules that violate `docs/architecture/architecture.md`'s dependency direction. If the existing structure forbids the consolidation, the contract itself is the conversation, not the refactor.
- Don't pick names without the `imaginate-` prefix.
- Don't propose more than ~5 deep modules in one plan — bigger plans never land. Slice further if needed.
- Don't fold modules just because they're small. Smallness is fine if the file already has a clean single-purpose boundary.
