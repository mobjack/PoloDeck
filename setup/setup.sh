#!/usr/bin/env bash
# PoloDeck — configure .env and run Docker Compose from setup/.
set -euo pipefail

SETUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SETUP_DIR}/.." && pwd)"
ENV_FILE="${SETUP_DIR}/.env"
ENV_EXAMPLE="${SETUP_DIR}/.env.example"
COMPOSE=(docker compose -f "${SETUP_DIR}/docker-compose.yml" --project-directory "${SETUP_DIR}")

usage() {
  cat <<'EOF'
PoloDeck setup (Docker)

  ./setup/setup.sh              First-time: copy .env from example, prompt for LAN bind, start stack + migrations
  ./setup/setup.sh install      Same as no args (non-interactive if stdin is not a TTY)
  ./setup/setup.sh config       Only create/update .env (interactive when TTY)
  ./setup/setup.sh up           Build and start containers (uses existing .env or copies example)
  ./setup/setup.sh down         Stop and remove containers
  ./setup/setup.sh migrate      Run prisma migrate deploy in the API container
  ./setup/setup.sh build        docker compose build
  ./setup/setup.sh logs         docker compose logs -f

Environment (non-interactive / CI):

  POLODECK_BIND_ADDRESS=0.0.0.0   Skip LAN prompt; use with install/up
  POLODECK_SETUP_SKIP_START=1   config/install: write .env only, do not run compose

From repo root, quick start:

  ./setup/setup.sh
EOF
}

upsert_env() {
  local key="$1" val="$2" file="$3"
  local tmp found=0
  tmp="$(mktemp)"
  if [[ -f "$file" ]]; then
    while IFS= read -r line || [[ -n "${line}" ]]; do
      if [[ "${line}" =~ ^${key}= ]]; then
        echo "${key}=${val}" >>"${tmp}"
        found=1
      else
        printf '%s\n' "${line}" >>"${tmp}"
      fi
    done <"${file}"
  fi
  if [[ "${found}" -eq 0 ]]; then
    echo "${key}=${val}" >>"${tmp}"
  fi
  mv "${tmp}" "${file}"
}

ensure_env_file() {
  if [[ ! -f "${ENV_EXAMPLE}" ]]; then
    echo "error: missing ${ENV_EXAMPLE}" >&2
    exit 1
  fi
  if [[ ! -f "${ENV_FILE}" ]]; then
    cp "${ENV_EXAMPLE}" "${ENV_FILE}"
    echo "Created ${ENV_FILE} from .env.example"
  fi
}

prompt_bind() {
  local bind_default="127.0.0.1"
  if [[ ! -t 0 ]]; then
    echo "${POLODECK_BIND_ADDRESS:-${bind_default}}"
    return
  fi
  echo ""
  echo "Bind address for API (:3000) and web-app (:8080) on this machine."
  echo "  127.0.0.1 — localhost only (default)"
  echo "  0.0.0.0   — all interfaces (other PCs / Raspberry Pis on your pool LAN)"
  echo ""
  read -r -p "Use LAN binding (0.0.0.0)? [y/N] " LAN
  if [[ "${LAN,,}" == "y" || "${LAN,,}" == "yes" ]]; then
    echo "0.0.0.0"
  else
    echo "${bind_default}"
  fi
}

configure_env_interactive() {
  ensure_env_file
  local bind
  bind="$(prompt_bind)"
  upsert_env "POLODECK_BIND_ADDRESS" "${bind}" "${ENV_FILE}"
  echo "Updated POLODECK_BIND_ADDRESS=${bind} in ${ENV_FILE}"
}

run_migrate() {
  (cd "${SETUP_DIR}" && "${COMPOSE[@]}" exec -T polodeck-api npx prisma migrate deploy)
}

# One-off container: works right after `up` even if the long-running API is still restarting.
run_migrate_install() {
  local i
  for i in $(seq 1 15); do
    if (cd "${SETUP_DIR}" && "${COMPOSE[@]}" run --rm polodeck-api npx prisma migrate deploy); then
      return 0
    fi
    echo "Migrate not ready yet, retrying in 2s… (${i}/15)"
    sleep 2
  done
  echo "error: prisma migrate deploy failed after retries" >&2
  return 1
}

cmd_up() {
  ensure_env_file
  (cd "${SETUP_DIR}" && "${COMPOSE[@]}" up -d --build)
}

cmd_install() {
  ensure_env_file
  if [[ -t 0 ]]; then
    local bind
    bind="$(prompt_bind)"
    upsert_env "POLODECK_BIND_ADDRESS" "${bind}" "${ENV_FILE}"
    echo "Wrote POLODECK_BIND_ADDRESS to ${ENV_FILE}"
  else
    local bind="${POLODECK_BIND_ADDRESS:-127.0.0.1}"
    upsert_env "POLODECK_BIND_ADDRESS" "${bind}" "${ENV_FILE}"
    echo "Non-interactive: POLODECK_BIND_ADDRESS=${bind} (set env to override)"
  fi

  if [[ "${POLODECK_SETUP_SKIP_START:-}" == "1" ]]; then
    echo "POLODECK_SETUP_SKIP_START=1 — not starting containers."
    return 0
  fi

  echo ""
  echo "Building and starting stack (Postgres, API, web-app)…"
  (cd "${SETUP_DIR}" && "${COMPOSE[@]}" up -d --build)

  echo ""
  echo "Applying database migrations…"
  run_migrate_install

  echo ""
  echo "PoloDeck is up."
  echo "  API:      http://localhost:3000"
  echo "  Web app:  http://localhost:8080"
  echo "  Health:   http://localhost:3000/health"
  echo ""
  echo "Repo: ${REPO_ROOT}"
}

main() {
  local cmd="${1:-install}"
  case "${cmd}" in
    -h | --help | help)
      usage
      ;;
    config)
      echo "PoloDeck — configure ${ENV_FILE}"
      configure_env_interactive
      ;;
    install)
      echo "PoloDeck — install (Docker)"
      cmd_install
      ;;
    up)
      ensure_env_file
      cmd_up
      echo ""
      echo "Stack started. Apply migrations if this is a new database:"
      echo "  ./setup/setup.sh migrate"
      ;;
    down)
      (cd "${SETUP_DIR}" && "${COMPOSE[@]}" down)
      ;;
    migrate)
      ensure_env_file
      run_migrate
      ;;
    build)
      ensure_env_file
      (cd "${SETUP_DIR}" && "${COMPOSE[@]}" build)
      ;;
    logs)
      (cd "${SETUP_DIR}" && "${COMPOSE[@]}" logs -f)
      ;;
    *)
      echo "error: unknown command: ${cmd}" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
