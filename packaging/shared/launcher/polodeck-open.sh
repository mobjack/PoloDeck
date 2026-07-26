#!/usr/bin/env bash
# Launcher only: wait for health, open default browser, or show a simple message.
set -euo pipefail

PORT="${POLODECK_PORT:-8080}"
BASE="http://127.0.0.1:${PORT}"
LOG_HINT="${POLODECK_LOG_HINT:-PoloDeck service logs}"

is_ready() {
  curl -fsS --max-time 2 "${BASE}/health/ready" >/dev/null 2>&1 || \
    curl -fsS --max-time 2 "${BASE}/health" >/dev/null 2>&1
}

open_url() {
  local url="$1"
  if command -v open >/dev/null 2>&1; then
    open "${url}"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${url}"
  else
    echo "Open this address in your browser: ${url}"
  fi
}

show_message() {
  local title="$1"
  local body="$2"
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display alert \"${title}\" message \"${body}\"" || true
  elif command -v zenity >/dev/null 2>&1; then
    zenity --error --title="${title}" --text="${body}" || true
  elif command -v notify-send >/dev/null 2>&1; then
    notify-send "${title}" "${body}" || true
  else
    echo "${title}: ${body}" >&2
  fi
}

# Brief wait for service after login/reboot
for _ in $(seq 1 20); do
  if is_ready; then
    # Prefer setup wizard when not complete
    if curl -fsS --max-time 2 "${BASE}/api/setup/status" 2>/dev/null | grep -q '"setupComplete":false'; then
      if curl -fsS --max-time 2 "${BASE}/api/setup/status" 2>/dev/null | grep -q '"requireSetup":true'; then
        open_url "${BASE}/setup"
        exit 0
      fi
    fi
    open_url "${BASE}/"
    exit 0
  fi
  sleep 0.5
done

show_message "PoloDeck is unavailable" \
  "PoloDeck Core did not become ready. Wait a few seconds and try again, or check ${LOG_HINT}."
exit 1
