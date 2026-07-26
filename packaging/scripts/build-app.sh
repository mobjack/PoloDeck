#!/usr/bin/env bash
# Build API + web-app and assemble the native app tree (without OS runtimes).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="$(tr -d '[:space:]' <"${ROOT}/packaging/VERSION")"
OUT="${1:-${ROOT}/packaging/dist/app}"

echo "Building PoloDeck app v${VERSION} → ${OUT}"

rm -rf "${OUT}"
mkdir -p "${OUT}/api" "${OUT}/web" "${OUT}/bin"

# API
(
  cd "${ROOT}/api"
  if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
  npx prisma generate
  npm run build
)

# Web (same-origin /api)
(
  cd "${ROOT}/web-app"
  if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
  npm run sync-kiosk || true
  VITE_API_URL=/api VITE_SOCKET_URL= npm run build
)

# Stage API production tree (dist already includes generated prisma client)
rsync -a "${ROOT}/api/dist/" "${OUT}/api/dist/"
rsync -a "${ROOT}/api/prisma/" "${OUT}/api/prisma/"
cp "${ROOT}/api/package.json" "${ROOT}/api/package-lock.json" "${OUT}/api/"
# Keep a copy of generated sources for prisma CLI
mkdir -p "${OUT}/api/src/generated"
rsync -a "${ROOT}/api/src/generated/" "${OUT}/api/src/generated/"

(
  cd "${OUT}/api"
  npm ci --omit=dev
  npx prisma generate
  # Ensure dist/generated matches
  mkdir -p dist/generated
  rsync -a src/generated/prisma/ dist/generated/prisma/
)

rsync -a "${ROOT}/web-app/dist/" "${OUT}/web/"

install -m 0755 "${ROOT}/packaging/shared/supervisor/"*.sh "${OUT}/bin/"
install -m 0755 "${ROOT}/packaging/shared/launcher/polodeck-open.sh" "${OUT}/bin/"

echo "${VERSION}" >"${OUT}/VERSION"
echo "App tree ready: ${OUT}"
