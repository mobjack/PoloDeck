#!/usr/bin/env bash
# Download private Node.js (+ optional PostgreSQL) runtimes into a staging directory.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION_NODE="${POLODECK_NODE_VERSION:-20.18.1}"
VERSION_PG="${POLODECK_PG_VERSION:-16.6}"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "${ARCH}" in
  x86_64|amd64) NODE_ARCH="x64"; PG_ARCH="x86_64" ;;
  arm64|aarch64) NODE_ARCH="arm64"; PG_ARCH="arm64" ;;
  *) echo "Unsupported arch: ${ARCH}" >&2; exit 1 ;;
esac

case "${OS}" in
  darwin) NODE_PLAT="darwin"; PLATFORM="macos" ;;
  linux) NODE_PLAT="linux"; PLATFORM="linux" ;;
  *) echo "Unsupported OS: ${OS}" >&2; exit 1 ;;
esac

OUT="${1:-${ROOT}/packaging/dist/runtime-${PLATFORM}-${NODE_ARCH}}"
mkdir -p "${OUT}/node" "${OUT}/postgres"

NODE_TAR="node-v${VERSION_NODE}-${NODE_PLAT}-${NODE_ARCH}.tar.gz"
NODE_URL="https://nodejs.org/dist/v${VERSION_NODE}/${NODE_TAR}"

echo "Fetching Node ${VERSION_NODE} (${NODE_PLAT}-${NODE_ARCH})…"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
curl -fsSL "${NODE_URL}" -o "${TMP}/${NODE_TAR}"
tar -xzf "${TMP}/${NODE_TAR}" -C "${TMP}"
rm -rf "${OUT}/node"
mkdir -p "${OUT}/node"
mv "${TMP}/node-v${VERSION_NODE}-${NODE_PLAT}-${NODE_ARCH}"/* "${OUT}/node/"

echo "Node installed at ${OUT}/node"

# PostgreSQL: prefer a pre-placed tarball, else document manual step / use system for smoke tests
PG_TARBALL="${POLODECK_PG_TARBALL:-}"
if [[ -n "${PG_TARBALL}" && -f "${PG_TARBALL}" ]]; then
  echo "Extracting PostgreSQL from ${PG_TARBALL}…"
  rm -rf "${OUT}/postgres"
  mkdir -p "${OUT}/postgres"
  tar -xzf "${PG_TARBALL}" -C "${OUT}/postgres" --strip-components=1
elif [[ "${POLODECK_USE_SYSTEM_PG_FOR_RUNTIME:-0}" == "1" ]]; then
  echo "POLODECK_USE_SYSTEM_PG_FOR_RUNTIME=1 — linking local PostgreSQL tools (dev/smoke only)."
  mkdir -p "${OUT}/postgres/bin"
  CANDIDATE_DIRS=(
    "/opt/homebrew/opt/postgresql@16/bin"
    "/usr/local/opt/postgresql@16/bin"
    "/usr/lib/postgresql/16/bin"
    "/usr/pgsql-16/bin"
  )
  for b in postgres initdb pg_ctl pg_isready psql pg_dump; do
    resolved=""
    if command -v "${b}" >/dev/null 2>&1; then
      resolved="$(command -v "${b}")"
    else
      for d in "${CANDIDATE_DIRS[@]}"; do
        if [[ -x "${d}/${b}" ]]; then
          resolved="${d}/${b}"
          break
        fi
      done
    fi
    if [[ -n "${resolved}" ]]; then
      ln -sf "${resolved}" "${OUT}/postgres/bin/${b}"
    fi
  done
  if [[ ! -x "${OUT}/postgres/bin/postgres" ]]; then
    echo "WARNING: could not find local postgres binaries to link." >&2
  fi
else
  cat >"${OUT}/postgres/README.md" <<EOF
# PostgreSQL ${VERSION_PG} binaries

Place a portable PostgreSQL ${VERSION_PG} (${PG_ARCH}) tree here with a \`bin/\` directory
containing \`postgres\`, \`initdb\`, \`pg_ctl\`, \`pg_isready\`, \`psql\`, and \`pg_dump\`.

Options:
- Set \`POLODECK_PG_TARBALL=/path/to/pgsql.tgz\` when running this script
- Or set \`POLODECK_USE_SYSTEM_PG_FOR_RUNTIME=1\` for local smoke tests only

Official binaries: https://www.postgresql.org/download/
EOF
  echo "WARNING: PostgreSQL binaries not bundled. See ${OUT}/postgres/README.md" >&2
fi

echo "${VERSION_NODE}" >"${OUT}/NODE_VERSION"
echo "${VERSION_PG}" >"${OUT}/PG_VERSION"
echo "Runtime staging complete: ${OUT}"
