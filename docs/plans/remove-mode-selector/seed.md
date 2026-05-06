# Remove Mode Selector / Ask Mode

Seed for `/imaginate-workflow-1-grill-me`. Paste the "Raw idea" section into the skill to start pressure-testing.

---

## Raw idea

Remove the `code` vs `ask` mode concept from Imaginate. The planner already classifies every request via `plan.requiresCoding` — when `false`, the run short-circuits to return the planner's `answer` field instead of running the executor. That makes the user-facing Mode toggle redundant: the agent figures out whether the user wants code or just an answer.

Goal: collapse to a single path (always "code" intent), let the planner decide whether to execute or just answer. Delete the selector, the `askAgent` Inngest function, the ask-mode prompt, and the `AgentMode` type.

## Why now

- Just consolidated `AgentMode` / `AgentRunIntent` into `src/shared/agent-mode.ts` during the architecture refactor — natural moment to ask whether the type should exist at all.
- Home screen already disables Ask (`disabledModes={["ask"]}`); the toggle on the home form has been removed in this branch. The selector now only appears mid-conversation in `messages-container`.
- Fewer concepts → simpler product story for an AI-coding-agent app where "code" is the default intent.

## Current state (as of 2026-05-05, branch `architecture-2026-05-06`)

Two execution paths:

| Mode   | Path                                                              | LLM calls | Tools | Sandbox         |
| ------ | ----------------------------------------------------------------- | --------- | ----- | --------------- |
| `code` | planner → executor (if `requiresCoding`) else `plan.answer`       | 1–N       | yes   | yes (if coding) |
| `ask`  | `askAgentFunction` → `prompts.ask` → planner-model `generateText` | 1         | no    | no              |

Behavior overlap: when a `code`-mode user types a Q&A question, planner returns `requiresCoding=false` with `plan.answer` — same outcome as Ask mode, slightly different prompt shape, comparable cost (one planner-model call).

## Proposed change

Always use the code path. Remove Ask mode end-to-end.

### Touch list

- `src/interfaces/inngest/functions.ts` — delete `askAgentFunction`, `EVENT_NAMES.askAgentRun` dispatch, `eventNameForMode`.
- `src/interfaces/inngest/events.ts` — drop `askAgentRun` event, `AgentMode` re-export, `eventNameForMode`.
- `src/shared/prompts/index.ts` — drop `ASK_AGENT_PROMPT`. Possibly fold its tone into the planner's guidance for the `answer` field.
- `src/shared/agent-mode.ts` — delete `AgentMode`; simplify `AgentRunIntent` (drop `mode`).
- `src/features/messages/application/index.ts` — drop `createAskMessage`, `CreateAskAssistantMessageInput`, mode parameters on workflow inputs.
- `src/features/messages/adapters/prisma-message-repository.ts` — stop writing `MessageMode.ASK`; always `CODE`.
- `src/features/projects/adapters/prisma-project-repository.ts` — same.
- `src/ui/components/mode-selector/` — delete folder.
- `src/features/messages/presentation/containers/messages-container.tsx` — drop `ModeSelector`, hardcode `"code"` (or remove the parameter entirely).
- `src/features/projects/presentation/home/components/project-form.tsx` — already done in this branch (no selector, hardcoded `"code"`).
- Prisma schema — leave `MessageMode.ASK` as an orphan enum value for now. Drop in a separate migration once existing rows are confirmed safe to ignore (or backfill to `CODE`).

### Behavior the planner needs to absorb

The Ask prompt today emphasizes:

- Conversational tone for explanations, debugging, architectural guidance.
- Markdown formatting for code snippets.
- "If you're unsure, say so."

The planner's `answer` field currently gets ~no guidance on tone. If we collapse paths, the planner prompt should pick up the style hints so Q&A answers don't feel terse.

## Open questions for `/grill-me`

- Is there any user-visible behavior difference where Ask is meaningfully better than `code` + `requiresCoding=false`? (Latency? Vibe?)
- Do we keep the planner's `answer` field as the single Q&A output, or do we add a separate "answer-only" code path that uses a more conversational system prompt?
- Should `MessageMode` be reduced to a single value (or removed) in the DB? When?
- What happens to historical `MessageMode.ASK` rows in the messages list view — do they render the same as `CODE` answer-only rows?
- Is there a future where Ask comes back (e.g. cheaper model, no-tool privacy mode)? If so, dropping the type now means re-adding it later — acceptable cost?
- Does removing the toggle reduce a useful "I just want to chat" affordance, or does the planner classification cover it cleanly?

## Out of scope

- Renaming `MessageMode` enum values in Prisma (separate migration plan).
- Changing planner-model selection or fallbacks.
- Reworking the executor.

## References

- Architecture: `docs/architecture/architecture.md`
- Planner schema: `src/agent/domain/schemas.ts` (`requiresCoding`)
- Code path entry: `src/interfaces/inngest/functions.ts:168` (`if (!plan.requiresCoding)` short-circuit)
- Ask path entry: `src/interfaces/inngest/functions.ts:524` (`askAgentFunction`)
- Ask system prompt: `src/shared/prompts/index.ts` (`ASK_AGENT_PROMPT`)
