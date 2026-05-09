#!/usr/bin/env bash
# Thin helpers around NetworkManager (nmcli). Run with sudo when needed.
set -euo pipefail

usage() {
  echo "Usage: polodeck-wifi list" >&2
  echo "       polodeck-wifi connect <SSID> <password>" >&2
  echo "       polodeck-wifi set-hostname <name>" >&2
  exit 1
}

cmd="${1:-}"
case "${cmd}" in
  list)
    nmcli dev wifi list
    ;;
  connect)
    ssid="${2:-}"
    pass="${3:-}"
    [[ -n "${ssid}" && -n "${pass}" ]] || usage
    nmcli dev wifi connect "${ssid}" password "${pass}"
    ;;
  set-hostname)
    name="${2:-}"
    [[ -n "${name}" ]] || usage
    hostnamectl set-hostname "${name}"
    ;;
  ""|-h|--help|help)
    usage
    ;;
  *)
    usage
    ;;
esac
