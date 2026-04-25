# 04: Analysis queries and archive path

## Goal

Validate that the telemetry shape actually helps improve the harness, then add an export/archive path only if the data volume or analysis workflow calls for it.

## The problem

Telemetry is only useful if someone can ask useful questions of it. Adding fields and tables without analysis queries risks creating write-only observability.

The app also does not have much usage right now, so moving directly to S3-like object storage would add ingestion and query plumbing before there is enough data to justify it.

## What "after" looks like

Start with PostgreSQL queries over compact structured data:

```sql
-- success rate by planner task type
select
  "plannerTaskType",
  count(*) as total,
  count(*) filter (where "runStatus" = 'success') as successful
from "Telemetry"
group by "plannerTaskType";
```

Add a small internal analysis module or script that can report:

- success rate by task type
- escalation rate by model/provider
- average tokens by outcome
- average steps by outcome
- verification rate by task type
- build/test/lint success rates
- provider error categories over time
- slowest harness phases once duration metrics exist

If later needed, mirror compact append-only events to JSONL:

```json
{
  "type": "agent.step.finished",
  "messageId": "...",
  "attemptIndex": 1,
  "stepNumber": 3,
  "toolNames": ["readFiles", "applyPatch"],
  "totalTokens": 1280
}
```

Object storage should be an archive/export path, not the primary store, until usage or retention requirements prove otherwise.

## Sequencing

1. Add basic SQL or script-based analysis for the summary table.
2. Add analysis over attempt and verification records after chunk 3 lands.
3. Document privacy and retention rules for telemetry fields.
4. Add optional JSONL export from Postgres for offline analysis.
5. Consider direct object-storage writes only if Postgres volume, retention, or offline tooling becomes a real constraint.

## Definition of done / verification

- A developer can run one command or query set and see success rate, escalation rate, token usage, and verification rate.
- The analysis output does not require parsing logs or message content.
- Privacy rules are documented near the telemetry code or in architecture docs if they become project-wide policy.
- Object storage remains optional and justified by measured need.

## Out of scope

- Full dashboard design.
- Data warehouse integration.
- Raw prompt or output retention.
- Real-time alerting.

## Conflicts checked

Complements the `agent-runtime-decoupling` eval harness plan. The eval harness can emit or consume the same compact summary shape, while this chunk focuses on analysis of persisted production/dev run telemetry.
