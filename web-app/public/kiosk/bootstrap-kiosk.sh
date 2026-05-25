#!/usr/bin/env bash
# PoloDeck Pi kiosk — post-download installer (run as root).
# Invoked by GET /kb stub with: --artifacts-base URL --url CHROMIUM_START_URL [--apt-proxy URL]
# Optional env: POLODECK_APT_PROXY — same as --apt-proxy (Apt-Cacher NG: http://host:3142).
set -euo pipefail

ARTIFACTS=""
KIOSK_URL=""
APT_PROXY_URL=""
KIOSK_TYPE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --artifacts-base) ARTIFACTS="${2:?}"; shift 2 ;;
    --url) KIOSK_URL="${2:?}"; shift 2 ;;
    --apt-proxy) APT_PROXY_URL="${2:?}"; shift 2 ;;
    --kiosk-type) KIOSK_TYPE="${2:?}"; shift 2 ;;
    --) shift; continue ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ "$(id -u)" != "0" ]]; then
  echo "Run this script as root (sudo)." >&2
  exit 1
fi

if [[ -z "${ARTIFACTS}" || -z "${KIOSK_URL}" ]]; then
  echo "Usage: sudo bash bootstrap-kiosk.sh -- --artifacts-base URL --url CHROMIUM_URL [--apt-proxy URL] [--kiosk-type scoreboard|shot_clock|timer]" >&2
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

has_tty() {
  [[ -r /dev/tty && -w /dev/tty ]]
}

can_prompt_user() {
  has_tty || interactive_console
}

# User-visible messages: write once. (Old behavior printed to stderr and /dev/tty; on SSH
# and on the Pi console those are the same screen, so every line appeared twice.)
msg_user() {
  if has_tty; then
    printf '%s\n' "$@" >/dev/tty
  else
    printf '%s\n' "$@" >&2
  fi
}

prompt_user() {
  local prompt="$1"
  local __var="$2"
  local reply=""
  if has_tty; then
    printf '%s' "${prompt}" >/dev/tty
    read -r reply </dev/tty || true
  elif interactive_console; then
    read_console -r -p "${prompt}" reply || true
  else
    return 1
  fi
  printf -v "${__var}" '%s' "${reply}"
}

# Host from PoloDeck URLs passed by GET /kb (artifacts-base or Chromium start URL).
deck_host_from_url() {
  local u="${1:-}"
  u="${u#http://}"
  u="${u#https://}"
  if [[ -z "${u}" ]]; then
    return 1
  fi
  if [[ "${u}" == \[* ]]; then
    local host="${u#\[}"
    host="${host%%\]*}"
    [[ -n "${host}" ]] && printf '%s' "${host}"
    return
  fi
  local host="${u%%/*}"
  host="${host%%:*}"
  [[ -n "${host}" ]] && printf '%s' "${host}"
}

normalize_kiosk_type() {
  local raw="${1:-}"
  raw="$(printf '%s' "${raw}" | tr '[:upper:]' '[:lower:]' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/ /_/g')"
  case "${raw}" in
    ""|1|scoreboard|board|score) printf '%s' "scoreboard" ;;
    2|shot_clock|shotclock|clock|shot) printf '%s' "shot_clock" ;;
    3|timer) printf '%s' "timer" ;;
    *)
      echo "error: invalid kiosk type '${1}' (use scoreboard, shot_clock, or timer)" >&2
      return 1
      ;;
  esac
}

prompt_kiosk_type() {
  if [[ -n "${KIOSK_TYPE}" ]]; then
    KIOSK_TYPE="$(normalize_kiosk_type "${KIOSK_TYPE}")" || exit 1
    return 0
  fi
  if [[ -n "${POLODECK_KIOSK_TYPE:-}" ]]; then
    KIOSK_TYPE="$(normalize_kiosk_type "${POLODECK_KIOSK_TYPE}")" || exit 1
    return 0
  fi
  if ! can_prompt_user; then
    KIOSK_TYPE="scoreboard"
    return 0
  fi
  msg_user ""
  msg_user "What type of kiosk is this Raspberry Pi?"
  msg_user "  1) Scoreboard (landscape)"
  msg_user "  2) Shot clock (portrait)"
  msg_user "  3) Timer (landscape)"
  local choice=""
  while true; do
    prompt_user "Choose 1-3 [1]: " choice || true
    choice="$(printf '%s' "${choice:-1}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    if [[ -z "${choice}" ]]; then
      choice="1"
    fi
    if KIOSK_TYPE="$(normalize_kiosk_type "${choice}")"; then
      return 0
    fi
    msg_user "Please enter 1, 2, or 3."
  done
}

boot_config_txt() {
  if [[ -f /boot/firmware/config.txt ]]; then
    printf '%s' /boot/firmware/config.txt
  elif [[ -f /boot/config.txt ]]; then
    printf '%s' /boot/config.txt
  else
    return 1
  fi
}

# display_rotate in config.txt: 1 = 90° (portrait), 3 = 270° (portrait, other way up).
set_boot_display_rotate() {
  local rotate="${1:-0}"
  local cfg tmp
  cfg="$(boot_config_txt)" || {
    msg_user "Note: boot config.txt not found; portrait may need manual display_rotate."
    return 0
  }
  tmp="$(mktemp)"
  grep -v -E '^[[:space:]]*display_rotate=' "${cfg}" >"${tmp}"
  if [[ "${rotate}" != "0" ]]; then
    printf 'display_rotate=%s\n' "${rotate}" >>"${tmp}"
  fi
  cat "${tmp}" >"${cfg}"
  rm -f "${tmp}"
}

configure_display_for_kiosk_type() {
  local upside_down="${1:-}"
  rm -f /etc/polodeck-kiosk/display-rotate
  case "${KIOSK_TYPE}" in
    shot_clock)
      local rot=1
      if [[ "${upside_down}" == "yes" ]]; then
        rot=3
      fi
      set_boot_display_rotate "${rot}"
      printf '%s\n' "${rot}" >/etc/polodeck-kiosk/display-rotate
      chmod 644 /etc/polodeck-kiosk/display-rotate
      msg_user "Shot clock: set display_rotate=${rot} in $(boot_config_txt) (portrait after reboot)."
      ;;
    *)
      set_boot_display_rotate 0
      ;;
  esac
}

if [[ -z "${APT_PROXY_URL}" && -n "${POLODECK_APT_PROXY:-}" ]]; then
  APT_PROXY_URL="${POLODECK_APT_PROXY}"
fi

if [[ -z "${APT_PROXY_URL}" ]] && can_prompt_user; then
  DECK_HOST="$(deck_host_from_url "${ARTIFACTS}")" || DECK_HOST="$(deck_host_from_url "${KIOSK_URL}")" || DECK_HOST=""
  DEFAULT_APT_PROXY=""
  if [[ -n "${DECK_HOST}" ]]; then
    DEFAULT_APT_PROXY="http://${DECK_HOST}:3142"
  fi
  msg_user ""
  if [[ -n "${DEFAULT_APT_PROXY}" ]]; then
    prompt_user "Use apt HTTP proxy ${DEFAULT_APT_PROXY}? [Y/n] " use_proxy || true
    use_lc="$(printf '%s' "${use_proxy:-}" | tr '[:upper:]' '[:lower:]')"
    case "${use_lc}" in
      n|no) ;;
      *)
        APT_PROXY_URL="${DEFAULT_APT_PROXY}"
        ;;
    esac
  else
    prompt_user "Use apt HTTP proxy (e.g. Apt-Cacher NG on port 3142)? [y/N] " use_proxy || true
    use_lc="$(printf '%s' "${use_proxy:-}" | tr '[:upper:]' '[:lower:]')"
    case "${use_lc}" in
      y|yes)
        prompt_user "APT proxy base URL (e.g. http://192.168.1.10:3142): " APT_PROXY_URL || true
        APT_PROXY_URL="$(printf '%s' "${APT_PROXY_URL:-}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
        ;;
    esac
  fi
fi

prompt_kiosk_type

SHOT_CLOCK_UPSIDE_DOWN=""
if [[ "${KIOSK_TYPE}" == "shot_clock" ]] && can_prompt_user; then
  msg_user ""
  upside=""
  prompt_user "Shot clock display upside down? [y/N] " upside || true
  upside_lc="$(printf '%s' "${upside:-}" | tr '[:upper:]' '[:lower:]')"
  case "${upside_lc}" in
    y|yes) SHOT_CLOCK_UPSIDE_DOWN="yes" ;;
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
printf '%s\n' "${KIOSK_TYPE}" >/etc/polodeck-kiosk/kiosk-type
chmod 644 /etc/polodeck-kiosk/kiosk-type
configure_display_for_kiosk_type "${SHOT_CLOCK_UPSIDE_DOWN}"

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
# Fallback portrait for shot-clock Pis if boot config.txt rotate is not enough yet.
if [ -f /etc/polodeck-kiosk/kiosk-type ] && grep -qx shot_clock /etc/polodeck-kiosk/kiosk-type; then
  sleep 1
  out="$(xrandr --query 2>/dev/null | awk '/ connected/{print $1; exit}')"
  if [ -n "${out}" ]; then
    rot="left"
    if [ -f /etc/polodeck-kiosk/display-rotate ] && grep -qx 3 /etc/polodeck-kiosk/display-rotate; then
      rot="right"
    fi
    xrandr --output "${out}" --rotate "${rot}" 2>/dev/null || true
  fi
fi
exec /usr/local/bin/polodeck-chromium-launch.sh
XSEOF
chown polodeck:polodeck /home/polodeck/.xsession
chmod 755 /home/polodeck/.xsession

systemctl daemon-reload
systemctl enable polodeck-kiosk.service
# Do not start/restart kiosk here: getty stays on tty1 until polodeck-kiosk runs after reboot.

msg_user "PoloDeck kiosk installed (${KIOSK_TYPE}). Chromium URL: ${KIOSK_URL}"
msg_user "Console login stays on tty1 until reboot; polodeck-kiosk takes tty1 on boot."
if [[ "${KIOSK_TYPE}" == "shot_clock" ]]; then
  msg_user "Shot clock portrait display applies after reboot."
fi

if can_prompt_user; then
  msg_user ""
  reply=""
  prompt_user $'Reboot now? [Y/n] ' reply || true
  reply_lc="$(printf '%s' "${reply:-}" | tr '[:upper:]' '[:lower:]')"
  case "${reply_lc}" in
    n|no)
      msg_user "Run 'sudo reboot' when ready."
      exit 0
      ;;
  esac
fi

msg_user "Rebooting..."
reboot
