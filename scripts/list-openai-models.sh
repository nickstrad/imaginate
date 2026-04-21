#!/usr/bin/env bash
# List available OpenAI models for the configured OPENAI_API_KEY.
# Usage:   scripts/list-openai-models.sh [filter-prefix]
# Example: scripts/list-openai-models.sh gpt-5
set -euo pipefail

if [[ -f .env ]]; then set -a; source .env; set +a; fi
: "${OPENAI_API_KEY:?OPENAI_API_KEY is not set}"

FILTER="${1:-}"

curl -sS https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
| python3 -c "
import sys, json
d = json.load(sys.stdin)
prefix = '$FILTER'
ids = sorted(m['id'] for m in d.get('data', []))
for i in ids:
    if not prefix or i.startswith(prefix):
        print(i)
"
