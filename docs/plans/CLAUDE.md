See [AGENTS.md](./AGENTS.md) for plan-folder conventions. All instructions there apply to Claude.

In particular, completed plans are not kept by default: archive only plans with lasting decision value, and delete plans that were just execution sequencing after durable facts move into source-of-truth docs. Use `/plans-audit` for both stale-plan refreshes and completed-plan retirement; `/plan-archive` and `/plans-refresh` are aliases for that same workflow.
