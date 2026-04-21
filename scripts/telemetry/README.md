# scripts/telemetry/

Analyze agent run telemetry to identify tuning opportunities. Every successful run of `codeAgentFunction` writes one row to the `Telemetry` table (see `prisma/schema.prisma`). These scripts read that table and surface signals for improving the agent.

Connects to the database via `DATABASE_URL` in `.env` at the repo root (through `@/db` → Prisma).

## Scripts

| Script                 | Purpose                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `analyze-telemetry.ts` | Summarize rates, cap saturation, and distributions across recent runs. Emits threshold-triggered findings. |

## Usage

```bash
npx tsx scripts/telemetry/analyze-telemetry.ts                    # human-readable
npx tsx scripts/telemetry/analyze-telemetry.ts --json              # machine-readable
npx tsx scripts/telemetry/analyze-telemetry.ts --since=7d --limit=500
```

Flags:

- `--since=<N>d` — restrict to runs created in the last N days (default: all time).
- `--limit=<N>` — max rows to load (default: 1000).
- `--json` — emit a JSON report instead of the formatted table.

## What the report contains

- **Rates**: `buildSucceeded`, errored, wrote-without-verify, zero-write, zero-command.
- **Cap saturation**: percent of runs hitting `AGENT_CONFIG` limits (steps / writes / reads / terminal).
- **Distributions**: mean, p50, p90, p99, max for steps, files written/read, commands run, total tokens.
- **Findings**: auto-generated recommendations, e.g. "reinforce VERIFY step", "raise maxSteps", "tighten maxOutputTokens".

## When to run

- After shipping an agent-prompt or tool change — compare windows to see if behavior improved.
- When users report slow / failed generations — check error rate and cap saturation first.
- Before adjusting any value in `src/inngest/agent-config.ts` — this is the evidence for the change.
