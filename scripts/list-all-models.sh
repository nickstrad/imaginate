#!/usr/bin/env bash
# List available models from every configured provider.
# Usage: scripts/list-all-models.sh [filter-prefix]
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
FILTER="${1:-}"

for script in list-openai-models.sh list-anthropic-models.sh list-gemini-models.sh; do
  echo "=== $script ==="
  "$DIR/$script" "$FILTER" || echo "(skipped — see error above)"
  echo
done
