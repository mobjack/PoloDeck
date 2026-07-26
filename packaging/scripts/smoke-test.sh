#!/usr/bin/env bash
# Smoke-test a running Core (Docker or native) on localhost.
set -euo pipefail

PORT="${POLODECK_PORT:-8080}"
API_PORT="${POLODECK_API_PORT:-$PORT}"
BASE="${POLODECK_BASE:-http://127.0.0.1:${API_PORT}}"

echo "Health…"
curl -fsS "${BASE}/health" | grep -q ok

echo "Ready (may 503 if DB down)…"
curl -sS -o /tmp/polodeck-ready.json -w "%{http_code}" "${BASE}/health/ready" | grep -E '200|503' >/dev/null

echo "Setup status…"
curl -fsS "${BASE}/api/setup/status" | grep -q setupComplete

if curl -fsS "${BASE}/" >/dev/null 2>&1; then
  echo "UI root reachable"
else
  echo "UI root not on this port (Docker API-only is OK)"
fi

echo "Smoke OK against ${BASE}"
