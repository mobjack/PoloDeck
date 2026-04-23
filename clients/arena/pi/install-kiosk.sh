#!/usr/bin/env bash
# Install Chromium kiosk autostart on Raspberry Pi OS (Desktop / X11 session).
# For Wayland-only images, use manual fullscreen or X11 desktop mode.
#
# Usage: ./install-kiosk.sh "http://HOST:8090/?server=http://HOST:3000&gameId=GAME_ID"
# Run as the desktop user (usually pi), not root — writes to ~/.config/autostart
set -euo pipefail

URL="${1:-}"
if [[ -z "${URL}" ]]; then
  echo "Usage: $0 '<kiosk URL>'"
  echo "Example: $0 'http://192.168.1.50:8090/?server=http://192.168.1.50:3000&gameId=clxyz123'"
  exit 1
fi

AUTOSTART_DIR="${HOME}/.config/autostart"
mkdir -p "${AUTOSTART_DIR}"

CHROME="chromium-browser"
if ! command -v "${CHROME}" >/dev/null 2>&1; then
  if command -v chromium >/dev/null 2>&1; then
    CHROME="chromium"
  else
    echo "Install Chromium first (e.g. sudo apt install chromium-browser)."
    exit 1
  fi
fi

# Quote URL so & and other characters survive the .desktop Exec line.
printf '%s\n' '[Desktop Entry]' 'Type=Application' 'Name=PoloDeck Arena' \
  "Exec=${CHROME} --kiosk --noerrdialogs --disable-session-crashed-bubble --disable-infobars \"${URL//\"/\\\"}\"" \
  'X-GNOME-Autostart-enabled=true' >"${AUTOSTART_DIR}/polodeck-arena.desktop"

chmod 644 "${AUTOSTART_DIR}/polodeck-arena.desktop"

echo "Wrote ${AUTOSTART_DIR}/polodeck-arena.desktop"
echo "Log out and back in (or reboot) to start kiosk. Disable autologin if you need a login shell first."
echo "Edit URL: change the Exec= line in that file."
