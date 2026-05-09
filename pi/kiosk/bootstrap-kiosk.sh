#!/usr/bin/env bash
# PoloDeck Pi kiosk — post-download installer (run as root).
# Invoked by GET /kb stub with: --artifacts-base URL --url CHROMIUM_START_URL
set -euo pipefail

ARTIFACTS=""
KIOSK_URL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --artifacts-base) ARTIFACTS="${2:?}"; shift 2 ;;
    --url) KIOSK_URL="${2:?}"; shift 2 ;;
    --) shift; continue ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ "$(id -u)" != "0" ]]; then
  echo "Run this script as root (sudo)." >&2
  exit 1
fi

if [[ -z "${ARTIFACTS}" || -z "${KIOSK_URL}" ]]; then
  echo "Usage: sudo bash bootstrap-kiosk.sh -- --artifacts-base URL --url CHROMIUM_URL" >&2
  exit 1
fi

if ! test -r /proc/device-tree/model || ! grep -qi raspberry /proc/device-tree/model 2>/dev/null; then
  echo "This installer is only supported on Raspberry Pi hardware." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y \
  chromium \
  xserver-xorg xinit openbox x11-xserver-utils xdg-utils \
  curl \
  network-manager \
  || { echo "apt-get install failed." >&2; exit 1; }

if ! id polodeck &>/dev/null; then
  useradd -m -s /bin/bash -G video,tty,input,audio,render polodeck
fi
usermod -aG video,tty,input,audio,render polodeck

mkdir -p /etc/polodeck-kiosk
printf '%s\n' "${KIOSK_URL}" >/etc/polodeck-kiosk/url
chmod 644 /etc/polodeck-kiosk/url

fetch() {
  local name="$1" dest="$2"
  curl -fsSL "${ARTIFACTS%/}/${name}" -o "${dest}"
}

fetch polodeck-chromium-launch.sh /usr/local/bin/polodeck-chromium-launch.sh
chmod 755 /usr/local/bin/polodeck-chromium-launch.sh

fetch polodeck-wifi.sh /usr/local/bin/polodeck-wifi.sh
chmod 755 /usr/local/bin/polodeck-wifi.sh

fetch polodeck-kiosk.service /etc/systemd/system/polodeck-kiosk.service
chmod 644 /etc/systemd/system/polodeck-kiosk.service

cat >/etc/X11/Xwrapper.config <<'XWEOF'
allowed_users=anybody
needs_root_rights=yes
XWEOF
chmod 644 /etc/X11/Xwrapper.config

KMSDEV="/dev/dri/card0"
if [[ -e /dev/dri/card1 ]]; then
  KMSDEV="/dev/dri/card1"
fi
mkdir -p /etc/X11/xorg.conf.d
cat >/etc/X11/xorg.conf.d/99-polodeck-modesetting.conf <<XORGEOF
Section "Device"
    Identifier "PolodeckGPU"
    Driver "modesetting"
    Option "kmsdev" "${KMSDEV}"
EndSection
Section "Module"
    Disable "fbdev"
EndSection
XORGEOF
chmod 644 /etc/X11/xorg.conf.d/99-polodeck-modesetting.conf

cat >/home/polodeck/.xsession <<'XSEOF'
#!/bin/sh
xset s off 2>/dev/null || true
xset -dpms 2>/dev/null || true
xset s noblank 2>/dev/null || true
openbox &
exec /usr/local/bin/polodeck-chromium-launch.sh
XSEOF
chown polodeck:polodeck /home/polodeck/.xsession
chmod 755 /home/polodeck/.xsession

systemctl daemon-reload
systemctl disable --now getty@tty1.service >/dev/null 2>&1 || true
systemctl mask getty@tty1.service >/dev/null 2>&1 || true
systemctl enable polodeck-kiosk.service
systemctl restart polodeck-kiosk.service || systemctl start polodeck-kiosk.service

echo "PoloDeck kiosk installed. Chromium URL: ${KIOSK_URL}"

if [[ -t 0 ]] && [[ -t 1 ]]; then
  echo
  read -r -p "Reboot the Pi now to finish setup? [y/N] " reply || true
  reply_lc="$(printf '%s' "${reply:-}" | tr '[:upper:]' '[:lower:]')"
  case "${reply_lc}" in
    y|yes)
      echo "Rebooting..."
      reboot
      ;;
    *)
      echo "Skipping reboot. Run 'sudo reboot' (or 'reboot' as root) when ready."
      ;;
  esac
else
  echo "No interactive terminal (e.g. curl | bash). Run 'sudo reboot' when ready."
fi
