#!/bin/sh
set -eu

pkill -f "wrangler dev --config worker/match/wrangler.toml" 2>/dev/null || true

bun run dev:web &
WEB_PID=$!
bun run dev:match &
MATCH_PID=$!

cleanup() {
  kill "$WEB_PID" "$MATCH_PID" 2>/dev/null || true
  wait "$WEB_PID" "$MATCH_PID" 2>/dev/null || true
}

trap cleanup INT TERM EXIT
wait "$WEB_PID" "$MATCH_PID"
