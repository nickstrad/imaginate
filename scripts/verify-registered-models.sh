#!/usr/bin/env bash
# Cross-check every model ID registered in src/lib/providers.ts against the
# live model list from each provider's API. Exits non-zero if any registered
# ID isn't present in its provider's listing.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"

# Extract { provider, value } pairs from providers.ts.
python3 <<'PY' > /tmp/registered_models.txt
import re, pathlib
src = pathlib.Path("src/lib/providers.ts").read_text()

def extract(block_name):
    m = re.search(rf"export const {block_name} = \{{(.+?)\n\}} as const", src, re.S)
    if not m: return []
    body = m.group(1)
    out = []
    for provider_match in re.finditer(r"(openai|anthropic|gemini):\s*\[(.*?)\]", body, re.S):
        provider = provider_match.group(1)
        for v in re.finditer(r'value:\s*"([^"]+)"', provider_match.group(2)):
            out.append((provider, v.group(1), block_name))
    return out

for block in ("AVAILABLE_MODELS", "INTERNAL_MODELS"):
    for prov, val, src_block in extract(block):
        print(f"{prov}\t{val}\t{src_block}")
PY

echo "--- Fetching live model lists ---"
OPENAI="$("$DIR/list-openai-models.sh" || true)"
ANTHROPIC="$("$DIR/list-anthropic-models.sh" || true)"
GEMINI="$("$DIR/list-gemini-models.sh" || true)"

FAIL=0
echo "--- Verifying registered model IDs ---"
while IFS=$'\t' read -r provider model block; do
  case "$provider" in
    openai)    list="$OPENAI"    ;;
    anthropic) list="$ANTHROPIC" ;;
    gemini)    list="$GEMINI"    ;;
  esac
  if grep -Fxq "$model" <<<"$list"; then
    printf "  OK   %-10s %-45s (%s)\n" "$provider" "$model" "$block"
  else
    printf "  FAIL %-10s %-45s (%s) — not in live list\n" "$provider" "$model" "$block"
    FAIL=1
  fi
done < /tmp/registered_models.txt

rm -f /tmp/registered_models.txt
exit "$FAIL"
