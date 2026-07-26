#!/usr/bin/env bash
# Start or initialize the private PostgreSQL instance for PoloDeck Core.
set -euo pipefail

POLODECK_ROOT="${POLODECK_ROOT:-}"
if [[ -z "${POLODECK_ROOT}" ]]; then
  echo "POLODECK_ROOT is required" >&2
  exit 1
fi

SECRETS="${POLODECK_SECRETS_ENV:-}"
if [[ -n "${SECRETS}" && -f "${SECRETS}" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${SECRETS}"
  set +a
fi

PG_BIN="${POLODECK_PG_BIN:-${POLODECK_ROOT}/runtime/postgres/bin}"
PGDATA="${PGDATA:-${POLODECK_PGDATA:-}}"
PGPORT="${POLODECK_PG_PORT:-5432}"
PGHOST="${POLODECK_PG_HOST:-127.0.0.1}"
SOCKET_DIR="${POLODECK_PG_SOCKET_DIR:-}"

if [[ -z "${PGDATA}" ]]; then
  echo "PGDATA / POLODECK_PGDATA is required" >&2
  exit 1
fi

export PATH="${PG_BIN}:${PATH}"
mkdir -p "${PGDATA}"
if [[ -n "${SOCKET_DIR}" ]]; then
  mkdir -p "${SOCKET_DIR}"
fi

if [[ ! -f "${PGDATA}/PG_VERSION" ]]; then
  echo "Initializing PoloDeck database cluster…"
  PW="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required for init}"
  PWFILE="$(mktemp)"
  chmod 600 "${PWFILE}"
  printf '%s' "${PW}" >"${PWFILE}"
  initdb -D "${PGDATA}" -U "${POSTGRES_USER:-polodeck}" --pwfile="${PWFILE}" --auth-local=scram-sha-256 --auth-host=scram-sha-256 -E UTF8 --locale=C
  rm -f "${PWFILE}"
  {
    echo "listen_addresses = '127.0.0.1'"
    echo "port = ${PGPORT}"
    if [[ -n "${SOCKET_DIR}" ]]; then
      echo "unix_socket_directories = '${SOCKET_DIR}'"
    fi
  } >>"${PGDATA}/postgresql.conf"
fi

if pg_ctl -D "${PGDATA}" status >/dev/null 2>&1; then
  echo "PostgreSQL already running"
else
  LOGFILE="${POLODECK_PG_LOG:-${PGDATA}/postgres.log}"
  mkdir -p "$(dirname "${LOGFILE}")"
  if [[ -n "${SOCKET_DIR}" ]]; then
    pg_ctl -D "${PGDATA}" -l "${LOGFILE}" -w start -o "-k ${SOCKET_DIR}"
  else
    pg_ctl -D "${PGDATA}" -l "${LOGFILE}" -w start
  fi
fi

export PGPASSWORD="${POSTGRES_PASSWORD:?}"
EXISTS="$(psql -h "${PGHOST}" -p "${PGPORT}" -U "${POSTGRES_USER:-polodeck}" -d postgres -v ON_ERROR_STOP=1 -Atc \
  "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB:-polodeck}'" || true)"
if [[ "${EXISTS}" != "1" ]]; then
  psql -h "${PGHOST}" -p "${PGPORT}" -U "${POSTGRES_USER:-polodeck}" -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE \"${POSTGRES_DB:-polodeck}\" OWNER \"${POSTGRES_USER:-polodeck}\";"
fi

echo "PostgreSQL ready on ${PGHOST}:${PGPORT}"
