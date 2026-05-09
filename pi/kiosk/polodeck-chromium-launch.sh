#!/usr/bin/env bash
# Loop Chromium in kiosk mode (run as polodeck, from .xsession).
set -euo pipefail

URL_FILE=/etc/polodeck-kiosk/url
if [[ ! -f "${URL_FILE}" ]]; then
  echo "Missing ${URL_FILE}" >&2
  exit 1
fi
URL="$(tr -d '\r\n' <"${URL_FILE}")"

chromium_bin=(chromium)
if ! command -v chromium >/dev/null 2>&1; then
  if command -v chromium-browser >/dev/null 2>&1; then
    chromium_bin=(chromium-browser)
  else
    echo "No chromium binary found." >&2
    exit 1
  fi
fi

while true; do
  "${chromium_bin[@]}" \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-features=TranslateUI \
    --check-for-update-interval=31536000 \
    --autoplay-policy=no-user-gesture-required \
    "${URL}" || true
  sleep 2
done
