#!/usr/bin/env bash
# PoloDeck Pi kiosk — post-download installer (run as root).
# Invoked by GET /kb stub with: --artifacts-base URL --url CHROMIUM_START_URL [--apt-proxy URL]
# Optional env: POLODECK_APT_PROXY — same as --apt-proxy (Apt-Cacher NG: http://host:3142).
set -euo pipefail

ARTIFACTS=""
KIOSK_URL=""
APT_PROXY_URL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --artifacts-base) ARTIFACTS="${2:?}"; shift 2 ;;
    --url) KIOSK_URL="${2:?}"; shift 2 ;;
    --apt-proxy) APT_PROXY_URL="${2:?}"; shift 2 ;;
    --) shift; continue ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ "$(id -u)" != "0" ]]; then
  echo "Run this script as root (sudo)." >&2
  exit 1
fi

if [[ -z "${ARTIFACTS}" || -z "${KIOSK_URL}" ]]; then
  echo "Usage: sudo bash bootstrap-kiosk.sh -- --artifacts-base URL --url CHROMIUM_URL [--apt-proxy http://cache:3142]" >&2
  exit 1
fi

if ! test -r /proc/device-tree/model || ! grep -qi raspberry /proc/device-tree/model 2>/dev/null; then
  echo "This installer is only supported on Raspberry Pi hardware." >&2
  exit 1
fi

# curl … | sudo bash leaves stdin non-interactive; read prompts from /dev/tty when available.
read_console() {
  if [[ -t 0 ]]; then
    read -r "$@"
  elif [[ -r /dev/tty ]]; then
    read -r "$@" </dev/tty
  else
    return 1
  fi
}

interactive_console() {
  [[ -t 2 ]] && { [[ -t 0 ]] || [[ -r /dev/tty ]]; }
}

if [[ -z "${APT_PROXY_URL}" && -n "${POLODECK_APT_PROXY:-}" ]]; then
  APT_PROXY_URL="${POLODECK_APT_PROXY}"
fi

if [[ -z "${APT_PROXY_URL}" ]] && interactive_console; then
  echo "" >&2
  read_console -r -p "Use apt HTTP proxy (e.g. Apt-Cacher NG on port 3142)? [y/N] " use_proxy || true
  use_lc="$(printf '%s' "${use_proxy:-}" | tr '[:upper:]' '[:lower:]')"
  case "${use_lc}" in
    y|yes)
      read_console -r -p "APT proxy base URL (e.g. http://192.168.1.10:3142): " APT_PROXY_URL || true
      APT_PROXY_URL="$(printf '%s' "${APT_PROXY_URL:-}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
      ;;
  esac
fi

POLODECK_APT_PROXY_CONF="/etc/apt/apt.conf.d/99polodeck-apt-proxy.conf"

configure_apt_proxy() {
  local u="$1"
  u="${u%/}"
  if [[ -z "${u}" ]]; then
    return 0
  fi
  case "${u}" in
    http://*|https://*) ;;
    *)
      echo "error: apt proxy URL must start with http:// or https:// (got: ${u})" >&2
      exit 1
      ;;
  esac
  if [[ "${u}" == *\"* || "${u}" == *\'* || "${u}" == *\`* || "${u}" == *$'\n'* || "${u}" == *$'\r'* ]]; then
    echo "error: apt proxy URL contains unsupported characters" >&2
    exit 1
  fi
  printf 'Acquire::http::Proxy "%s";\nAcquire::https::Proxy "%s";\n' "${u}" "${u}" >"${POLODECK_APT_PROXY_CONF}"
  chmod 644 "${POLODECK_APT_PROXY_CONF}"
  echo "APT proxy configured (http + https via cache): ${u}"
}

configure_apt_proxy "${APT_PROXY_URL:-}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y \
  chromium \
  xserver-xorg xinit openbox x11-xserver-utils xdg-utils \
  curl \
  network-manager \
  || { echo "apt-get install failed." >&2; exit 1; }

if [[ -f "${POLODECK_APT_PROXY_CONF}" ]]; then
  rm -f "${POLODECK_APT_PROXY_CONF}"
  echo "Removed transient APT proxy config; future apt uses default mirrors."
fi

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

if interactive_console; then
  echo >&2
  read_console -r -p "Reboot the Pi now to finish setup? [y/N] " reply || true
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
