---
name: imaginate-workflow-2-write-prd
description: ONLY invoke when the user types `/imaginate-workflow-2-write-prd` or explicitly names this skill. Do NOT auto-trigger on phrases like "write a PRD" or "write the spec" — the user controls when this step runs so they can batch the workflow. Synthesizes a prior `imaginate-workflow-1-grill-me` Q&A into a Product Requirements Document at `docs/plans/<feature>.md`.
---

# Write a PRD

Synthesize the prior design conversation and a quick exploration of the codebase into a Product Requirements Document. Save it to `docs/plans/<feature-slug>.md` and report the path back to the user.

## Procedure

1. **Read the conversation.** Extract every concrete decision the user has confirmed during the grill-me Q&A. Decisions the user did not confirm are not facts — flag them as open questions instead of inventing answers.
2. **Explore the codebase.** Identify the modules the feature will touch. Read enough of each to confirm where the change goes; cite file paths in the PRD. Refer to `docs/architecture/architecture.md` to keep the proposed change inside the documented folder shape.
3. **Write the PRD** with these sections, in order:
   - **Problem statement** — one paragraph. What is broken or missing today, for whom, and why it matters.
   - **Proposed solution** — one paragraph. The shape of the change, not the implementation.
   - **User stories** — bulleted "As a X, I want Y, so that Z." Cover the golden path and the most important edge cases that came out of the grill.
   - **Modules to modify** — bullet list of `path/to/file.ts` entries with a one-line note on what changes there. New files get the same treatment.
   - **Implementation decisions** — every concrete decision from the grill. Quote the decision; do not re-derive it.
   - **Out of scope** — explicit list of things the user said no to or deferred. This is load-bearing; future sessions read this section to avoid scope creep.
   - **Open questions** — anything not resolved in the grill. If empty, say "None."
4. **Filename.** kebab-case based on the feature, e.g. `docs/plans/inline-image-editor.md`. If the file exists, append a date suffix rather than overwriting.
5. **Report back.** Print the path and a one-line summary. Do not paste the full PRD into chat.

## Anti-patterns

- Don't add sections the template doesn't list (success metrics, rollout plan, timeline). The PRD is a coding contract, not a launch doc.
- Don't invent decisions the user didn't make — surface them as open questions.
- Don't propose tickets or break down work; that's `tracer-bullets`' job.
