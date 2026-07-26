#!/usr/bin/env bash
# Start private Postgres (if needed), migrate, then exec the Core Node process.
set -euo pipefail

POLODECK_ROOT="${POLODECK_ROOT:?POLODECK_ROOT required}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CONFIG_ENV="${POLODECK_CONFIG_ENV:-}"
SECRETS_ENV="${POLODECK_SECRETS_ENV:-}"

load_env_file() {
  local f="$1"
  [[ -f "${f}" ]] || return 0
  set -a
  # shellcheck source=/dev/null
  source "${f}"
  set +a
}

load_env_file "${CONFIG_ENV}"
load_env_file "${SECRETS_ENV}"

export POLODECK_ROOT
export PATH="${POLODECK_ROOT}/runtime/node/bin:${POLODECK_ROOT}/runtime/postgres/bin:${PATH}"

# Start DB unless an external DATABASE_URL is already reachable and SKIP_LOCAL_PG=1
if [[ "${POLODECK_SKIP_LOCAL_PG:-0}" != "1" ]]; then
  "${SCRIPT_DIR}/polodeck-db.sh"
fi

# Wait for DB
ATTEMPTS=30
for i in $(seq 1 "${ATTEMPTS}"); do
  if pg_isready -h "${POLODECK_PG_HOST:-127.0.0.1}" -p "${POLODECK_PG_PORT:-5432}" -U "${POSTGRES_USER:-polodeck}" >/dev/null 2>&1; then
    break
  fi
  if [[ "${i}" -eq "${ATTEMPTS}" ]]; then
    echo "ERROR: Database did not become ready." >&2
    exit 1
  fi
  sleep 1
done

"${SCRIPT_DIR}/polodeck-migrate.sh"

NODE_BIN="${POLODECK_NODE_BIN:-${POLODECK_ROOT}/runtime/node/bin/node}"
API_DIR="${POLODECK_API_DIR:-${POLODECK_ROOT}/app/api}"
export POLODECK_WEB_ROOT="${POLODECK_WEB_ROOT:-${POLODECK_ROOT}/app/web}"
export POLODECK_CONFIG_ENV_PATH="${POLODECK_CONFIG_ENV_PATH:-${CONFIG_ENV}}"

cd "${API_DIR}"
echo "Starting PoloDeck Core…"
exec "${NODE_BIN}" dist/server.js
