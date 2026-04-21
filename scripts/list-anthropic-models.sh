#!/usr/bin/env bash
# List available Anthropic models for the configured ANTHROPIC_API_KEY.
# Usage:   scripts/list-anthropic-models.sh [filter-prefix]
# Example: scripts/list-anthropic-models.sh claude-sonnet
set -euo pipefail

if [[ -f .env ]]; then set -a; source .env; set +a; fi
: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY is not set}"

FILTER="${1:-}"

curl -sS https://api.anthropic.com/v1/models \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
| python3 -c "
import sys, json
d = json.load(sys.stdin)
prefix = '$FILTER'
ids = sorted(m['id'] for m in d.get('data', []))
for i in ids:
    if not prefix or i.startswith(prefix):
        print(i)
"
