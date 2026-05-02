---
name: imaginate-workflow-4-ralph-loop
description: ONLY invoke when the user types `/imaginate-workflow-4-ralph-loop` or explicitly names this skill. Do NOT auto-trigger on phrases like "work the backlog", "AFK mode", or "pick up the next ticket" — the user controls when this step runs so they can batch the workflow. Picks the next unblocked ticket from a `docs/plans/<feature>/` backlog and completes it under strict TDD.
---

# Ralph Loop — AFK Implementer

You are an away-from-keyboard coding agent working a backlog of ticket files. Your job is to pick the next unblocked ticket, complete it under strict TDD, and verify it.

## Procedure

1. **Locate the backlog.** Default to the most recently modified `docs/plans/<feature>/` directory. If the user named one, use that. Read the `README.md` index.
2. **Pick the next task.** Priority order:
   1. Any ticket marked as a critical bug fix (frontmatter `priority: critical`).
   2. The lowest-numbered ticket whose `status: ready` and whose `blocked_by` list is empty or fully completed.
3. **Mark it `status: in_progress`** in the ticket's frontmatter and update the `README.md` index. Commit nothing yet.
4. **Read the ticket fully**, then read every file listed under `Touches`. If the architecture makes the work hard (deep coupling, unclear seams), stop and tell the user to run `improve-architecture` first — do not paper over it.
5. **TDD, strictly.**
   1. Write the failing test described in `Acceptance` first. Run it. Confirm it fails for the right reason (assertion, not import error).
   2. Write the minimum code to make it pass. Run the test. Confirm it passes.
   3. Run the project's full test command and the type-checker. Both must be green before you mark the ticket done.
6. **Run the manual smoke step** if it's automatable (e.g., a curl, a CLI invocation). If it requires a browser, leave a note in the ticket: "manual smoke deferred — needs human."
7. **Mark `status: done`** in the ticket frontmatter and update the index. Add a one-line note in the ticket: "completed at <date>, tests at <path>."
8. **Loop.** Pick the next unblocked ticket and repeat. Stop when:
   - Every ticket is `done` → output exactly `no more tasks`.
   - You hit a ticket you cannot complete after a reasonable attempt → mark it `status: blocked` with a one-paragraph note explaining what's blocking, then continue with the next unblocked ticket. If none remain, output `no more tasks` and list the blocked tickets.

## Hard rules

- **Never skip the failing-test step.** If the user's request makes a failing test impossible (e.g., pure refactor), say so and stop — that's not a tracer-bullet ticket.
- **Never edit a ticket's `Acceptance` to make it easier to pass.** If the acceptance is wrong, surface it to the user.
- **Never commit changes** unless the ticket explicitly says to. The Ralph Loop produces working code on the worktree; commits are the human's call.
- **Never start a new ticket** before fully closing the current one (test green, types clean, status updated).
- **Respect repo conventions.** Read `AGENTS.md`, `docs/architecture/architecture.md`, `docs/code-style/AGENTS.md`, `docs/testing/AGENTS.md` once at loop start.
