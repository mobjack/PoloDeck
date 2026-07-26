#!/usr/bin/env bash
# Backup (optional) + prisma migrate deploy. Fail closed — do not start API on failure.
set -euo pipefail

POLODECK_ROOT="${POLODECK_ROOT:?POLODECK_ROOT required}"
API_DIR="${POLODECK_API_DIR:-${POLODECK_ROOT}/app/api}"
BACKUP_DIR="${POLODECK_BACKUP_DIR:-}"
NODE_BIN="${POLODECK_NODE_BIN:-${POLODECK_ROOT}/runtime/node/bin/node}"
NPX_BIN="${POLODECK_NPX_BIN:-${POLODECK_ROOT}/runtime/node/bin/npx}"
PG_BIN="${POLODECK_PG_BIN:-${POLODECK_ROOT}/runtime/postgres/bin}"

export PATH="${POLODECK_ROOT}/runtime/node/bin:${PG_BIN}:${PATH}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if [[ -n "${BACKUP_DIR}" ]]; then
  mkdir -p "${BACKUP_DIR}"
  STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  DUMP="${BACKUP_DIR}/pre-migrate-${STAMP}.sql"
  echo "Backing up database to ${DUMP}"
  if ! pg_dump "${DATABASE_URL}" --no-owner --no-acl -f "${DUMP}"; then
    echo "ERROR: pre-migration backup failed. Refusing to migrate." >&2
    exit 1
  fi
  # Keep last 10 dumps
  ls -1t "${BACKUP_DIR}"/pre-migrate-*.sql 2>/dev/null | tail -n +11 | while read -r f; do
    rm -f "${f}"
  done || true
fi

cd "${API_DIR}"
echo "Applying database migrations…"
if ! "${NPX_BIN}" prisma migrate deploy --schema=prisma/schema.prisma; then
  echo "ERROR: Migration failed. PoloDeck will not start until this is fixed." >&2
  echo "Restore from a backup under ${BACKUP_DIR:-'(no backup dir)'} if needed." >&2
  # Quarantine marker for launcher messaging
  if [[ -n "${BACKUP_DIR}" ]]; then
    echo "migrate failed at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >"${BACKUP_DIR}/MIGRATE_FAILED"
  fi
  exit 1
fi

if [[ -n "${BACKUP_DIR}" && -f "${BACKUP_DIR}/MIGRATE_FAILED" ]]; then
  rm -f "${BACKUP_DIR}/MIGRATE_FAILED"
fi

echo "Migrations OK"
