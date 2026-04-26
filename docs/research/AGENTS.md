# Research Notes

`docs/research/` is for agent-oriented research notes from conversations, vendor comparisons, technical investigations, and exploratory tradeoff analysis that may matter later but do not yet define work.

Use this folder when the result is useful context, but none of these are true:

- The team has committed to implementation work. Use `docs/plans/open/` instead.
- The content changes a current repo contract. Update the relevant source-of-truth doc instead.
- The content is a durable how-to/reference that future coding work should routinely load. Use `docs/documentation/` instead.

## Writing Research

- Start each note with the research date and the question being answered.
- Make the note useful to a future agent that did not see the conversation.
- Separate observed facts, repo-specific implications, and recommendations.
- Include source links for external facts, especially pricing, limits, APIs, and vendor claims.
- Call out staleness risk for fast-moving information such as pricing, model/platform capabilities, limits, and terms.
- Keep recommendations non-binding unless there is a linked plan or source-of-truth update.

## Maintenance

- Research notes are not source of truth. Before implementing from a research note, verify current docs/pricing and check whether a newer plan or architecture doc supersedes it.
- If research turns into committed work, create or update a plan and link back to the research note for context.
- Delete or archive stale notes when they no longer help future agents make better decisions.
