# scripts/

Operational scripts, grouped by concern. Each subfolder has its own README with usage details.

| Folder                       | Concern                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| [`models/`](./models/)       | Inspect provider `/models` endpoints and verify IDs in `src/lib/providers.ts` against reality.   |
| [`telemetry/`](./telemetry/) | Analyze rows in the `Telemetry` table to surface agent-tuning signals (caps, verify rate, etc.). |

All scripts read credentials from `.env` at the repo root.
