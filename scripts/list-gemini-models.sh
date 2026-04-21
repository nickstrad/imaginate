#!/usr/bin/env bash
# List available Google Gemini models for the configured GEMINI_API_KEY.
# Usage:   scripts/list-gemini-models.sh [filter-prefix]
# Example: scripts/list-gemini-models.sh gemini-3
set -euo pipefail

if [[ -f .env ]]; then set -a; source .env; set +a; fi
: "${GEMINI_API_KEY:?GEMINI_API_KEY is not set}"

FILTER="${1:-}"

curl -sS "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" \
| python3 -c "
import sys, json
d = json.load(sys.stdin)
prefix = '$FILTER'
ids = sorted(m['name'].replace('models/', '') for m in d.get('models', []))
for i in ids:
    if not prefix or i.startswith(prefix):
        print(i)
"
