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

find_pg_prefix() {
  local candidates=(
    "/opt/homebrew/opt/postgresql@16"
    "/usr/local/opt/postgresql@16"
    "/usr/lib/postgresql/16"
    "/usr/pgsql-16"
  )
  local d
  for d in "${candidates[@]}"; do
    if [[ -x "${d}/bin/postgres" ]]; then
      echo "${d}"
      return 0
    fi
  done
  if command -v postgres >/dev/null 2>&1; then
    dirname "$(dirname "$(command -v postgres)")"
    return 0
  fi
  return 1
}

# PostgreSQL: tarball, copy system tree (release packages), or symlink (dev smoke)
PG_TARBALL="${POLODECK_PG_TARBALL:-}"
if [[ -n "${PG_TARBALL}" && -f "${PG_TARBALL}" ]]; then
  echo "Extracting PostgreSQL from ${PG_TARBALL}…"
  rm -rf "${OUT}/postgres"
  mkdir -p "${OUT}/postgres"
  tar -xzf "${PG_TARBALL}" -C "${OUT}/postgres" --strip-components=1
elif [[ "${POLODECK_COPY_SYSTEM_PG:-0}" == "1" ]]; then
  echo "POLODECK_COPY_SYSTEM_PG=1 — copying local PostgreSQL tree into the package…"
  PG_PREFIX="$(find_pg_prefix)" || {
    echo "ERROR: could not find PostgreSQL 16 to copy. Install postgresql@16 / postgresql-16 first." >&2
    exit 1
  }
  rm -rf "${OUT}/postgres"
  mkdir -p "${OUT}/postgres"
  # Prefer full prefix (bin + lib + share). Debian layout may split share.
  if [[ -d "${PG_PREFIX}/bin" ]]; then
    rsync -a "${PG_PREFIX}/" "${OUT}/postgres/"
  fi
  if [[ ! -d "${OUT}/postgres/share" && -d /usr/share/postgresql/16 ]]; then
    mkdir -p "${OUT}/postgres/share"
    rsync -a /usr/share/postgresql/16/ "${OUT}/postgres/share/"
  fi
  if [[ ! -x "${OUT}/postgres/bin/postgres" ]]; then
    echo "ERROR: copy failed; ${OUT}/postgres/bin/postgres missing" >&2
    exit 1
  fi
  echo "PostgreSQL copied from ${PG_PREFIX}"
elif [[ "${POLODECK_USE_SYSTEM_PG_FOR_RUNTIME:-0}" == "1" ]]; then
  echo "POLODECK_USE_SYSTEM_PG_FOR_RUNTIME=1 — linking local PostgreSQL tools (dev/smoke only)."
  mkdir -p "${OUT}/postgres/bin"
  PG_PREFIX="$(find_pg_prefix || true)"
  for b in postgres initdb pg_ctl pg_isready psql pg_dump; do
    resolved=""
    if [[ -n "${PG_PREFIX}" && -x "${PG_PREFIX}/bin/${b}" ]]; then
      resolved="${PG_PREFIX}/bin/${b}"
    elif command -v "${b}" >/dev/null 2>&1; then
      resolved="$(command -v "${b}")"
    fi
    if [[ -n "${resolved}" ]]; then
      ln -sf "${resolved}" "${OUT}/postgres/bin/${b}"
    fi
  done
  if [[ ! -x "${OUT}/postgres/bin/postgres" && ! -L "${OUT}/postgres/bin/postgres" ]]; then
    echo "WARNING: could not find local postgres binaries to link." >&2
  fi
else
  cat >"${OUT}/postgres/README.md" <<EOF
# PostgreSQL ${VERSION_PG} binaries

Place a portable PostgreSQL ${VERSION_PG} (${PG_ARCH}) tree here with a \`bin/\` directory
containing \`postgres\`, \`initdb\`, \`pg_ctl\`, \`pg_isready\`, \`psql\`, and \`pg_dump\`.

Options:
- Set \`POLODECK_PG_TARBALL=/path/to/pgsql.tgz\` when running this script
- Set \`POLODECK_COPY_SYSTEM_PG=1\` to copy a local PostgreSQL 16 install (CI/release)
- Set \`POLODECK_USE_SYSTEM_PG_FOR_RUNTIME=1\` to symlink tools (local smoke tests only)

Official binaries: https://www.postgresql.org/download/
EOF
  echo "WARNING: PostgreSQL binaries not bundled. See ${OUT}/postgres/README.md" >&2
fi

echo "${VERSION_NODE}" >"${OUT}/NODE_VERSION"
echo "${VERSION_PG}" >"${OUT}/PG_VERSION"
echo "Runtime staging complete: ${OUT}"
