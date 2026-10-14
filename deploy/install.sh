#!/usr/bin/env bash
# PoloDeck customer installer and lifecycle helper for macOS/Linux.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${DEPLOY_DIR}/.env"
ENV_EXAMPLE="${DEPLOY_DIR}/.env.example"
COMPOSE=(docker compose --project-directory "${DEPLOY_DIR}" --env-file "${ENV_FILE}" -f "${DEPLOY_DIR}/compose.yml")

usage() {
  cat <<'EOF'
PoloDeck Docker installer

  ./deploy/install.sh install             Configure, pull, migrate, and start PoloDeck
  ./deploy/install.sh update [VERSION]    Pull and start latest or a specific version
  ./deploy/install.sh rollback VERSION    Return to a previously published version
  ./deploy/install.sh start|stop|status   Manage the stack
  ./deploy/install.sh logs                Follow application logs
  ./deploy/install.sh backup              Create a PostgreSQL dump under deploy/backups
  ./deploy/install.sh uninstall           Stop containers; preserve the database volume

Docker Desktop/Engine and Docker Compose are prerequisites.
EOF
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is required: https://docs.docker.com/get-docker/" >&2
    exit 1
  fi
  docker compose version >/dev/null
  docker info >/dev/null
}

upsert_env() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  awk -v key="${key}" -v value="${value}" '
    BEGIN { found=0 }
    index($0, key "=") == 1 { print key "=" value; found=1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "${ENV_FILE}" >"${tmp}"
  mv "${tmp}" "${ENV_FILE}"
}

env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "${ENV_FILE}" | tail -n 1
}

ensure_env() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    cp "${ENV_EXAMPLE}" "${ENV_FILE}"
    upsert_env POSTGRES_PASSWORD "$(openssl rand -hex 24)"
    chmod 600 "${ENV_FILE}"
    echo "Created ${ENV_FILE} with a generated database password."
  fi
}

wait_for_health() {
  local port i
  port="$(env_value POLODECK_PORT)"
  port="${port:-8080}"
  for i in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
      echo "PoloDeck is ready at http://localhost:${port}"
      return 0
    fi
    sleep 2
  done
  echo "PoloDeck did not become healthy. Run ./deploy/install.sh logs." >&2
  return 1
}

deploy_version() {
  local version="${1:-}"
  ensure_env
  if [[ -n "${version}" ]]; then
    upsert_env POLODECK_VERSION "${version#v}"
  fi
  "${COMPOSE[@]}" config --quiet
  "${COMPOSE[@]}" pull
  "${COMPOSE[@]}" up -d postgres
  "${COMPOSE[@]}" run --rm polodeck-api npx prisma migrate deploy
  "${COMPOSE[@]}" up -d --remove-orphans
  wait_for_health
}

backup_database() {
  local backup_dir file db_user db_name
  ensure_env
  backup_dir="${DEPLOY_DIR}/backups"
  mkdir -p "${backup_dir}"
  file="${backup_dir}/polodeck-$(date -u +%Y%m%dT%H%M%SZ).sql"
  db_user="$(env_value POSTGRES_USER)"
  db_name="$(env_value POSTGRES_DB)"
  "${COMPOSE[@]}" exec -T postgres pg_dump -U "${db_user}" "${db_name}" >"${file}"
  chmod 600 "${file}"
  echo "Backup written to ${file}"
}

cmd="${1:-install}"
case "${cmd}" in
  install)
    require_docker
    deploy_version
    ;;
  update)
    require_docker
    deploy_version "${2:-latest}"
    ;;
  rollback)
    [[ -n "${2:-}" ]] || { echo "rollback requires a version" >&2; exit 1; }
    require_docker
    deploy_version "${2}"
    ;;
  start)
    require_docker; ensure_env; "${COMPOSE[@]}" up -d; wait_for_health
    ;;
  stop)
    require_docker; ensure_env; "${COMPOSE[@]}" stop
    ;;
  status)
    require_docker; ensure_env; "${COMPOSE[@]}" ps
    ;;
  logs)
    require_docker; ensure_env; "${COMPOSE[@]}" logs -f
    ;;
  backup)
    require_docker; backup_database
    ;;
  uninstall)
    require_docker; ensure_env; "${COMPOSE[@]}" down
    echo "Containers removed. Database volume and ${ENV_FILE} were preserved."
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "Unknown command: ${cmd}" >&2
    usage >&2
    exit 1
    ;;
esac
