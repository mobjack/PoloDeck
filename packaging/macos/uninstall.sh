#!/usr/bin/env bash
# Uninstall PoloDeck Core on macOS. Preserves data unless --purge is passed.
set -euo pipefail

PURGE=0
if [[ "${1:-}" == "--purge" ]]; then
  PURGE=1
fi

launchctl bootout system/com.polodeck.core 2>/dev/null || true
rm -f /Library/LaunchDaemons/com.polodeck.core.plist
rm -rf "/Applications/PoloDeck.app"
rm -rf "/Library/Application Support/PoloDeck/app" \
  "/Library/Application Support/PoloDeck/runtime" \
  "/Library/Application Support/PoloDeck/bin"

if [[ "${PURGE}" -eq 1 ]]; then
  rm -rf "/Library/Application Support/PoloDeck" "/Library/Logs/PoloDeck"
  echo "PoloDeck removed including game data."
else
  echo "PoloDeck app removed. Data kept under /Library/Application Support/PoloDeck (use --purge to delete)."
fi
