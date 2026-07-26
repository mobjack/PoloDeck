#!/usr/bin/env bash
# Build an unsigned macOS .pkg (arm64). Sign/notarize separately when Developer ID is available.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="$(tr -d '[:space:]' <"${ROOT}/packaging/VERSION")"
ARCH_NODE="arm64"
APP="${ROOT}/packaging/dist/app"
RUNTIME="${ROOT}/packaging/dist/runtime-macos-${ARCH_NODE}"
STAGE="${ROOT}/packaging/dist/macos-root"
SCRIPTS="${ROOT}/packaging/dist/macos-scripts"
OUT_DIR="${ROOT}/packaging/dist"
PKG="${OUT_DIR}/PoloDeck-${VERSION}-arm64.pkg"
IDENTIFIER="com.polodeck.core"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "build-pkg.sh must run on macOS" >&2
  exit 1
fi

if [[ ! -d "${APP}/api" ]]; then
  "${ROOT}/packaging/scripts/build-app.sh" "${APP}"
fi
if [[ ! -d "${RUNTIME}/node/bin" ]]; then
  echo "Build runtime first: packaging/scripts/build-runtime.sh" >&2
  exit 1
fi

rm -rf "${STAGE}" "${SCRIPTS}"
mkdir -p \
  "${STAGE}/Library/Application Support/PoloDeck" \
  "${STAGE}/Library/LaunchDaemons" \
  "${STAGE}/Applications/PoloDeck.app/Contents/MacOS" \
  "${STAGE}/Applications/PoloDeck.app/Contents/Resources" \
  "${SCRIPTS}"

BASE="${STAGE}/Library/Application Support/PoloDeck"
rsync -a "${APP}/" "${BASE}/app/"
rsync -a "${RUNTIME}/node/" "${BASE}/runtime/node/"
rsync -a "${RUNTIME}/postgres/" "${BASE}/runtime/postgres/"
mkdir -p "${BASE}/bin" "${BASE}/config" "${BASE}/secrets" "${BASE}/data" "${BASE}/backups"
install -m 0755 "${ROOT}/packaging/shared/supervisor/"*.sh "${BASE}/bin/"
install -m 0755 "${ROOT}/packaging/shared/launcher/polodeck-open.sh" "${BASE}/bin/"
install -m 0644 "${ROOT}/packaging/shared/env/polodeck.env.example" "${BASE}/config/polodeck.env"
install -m 0644 "${ROOT}/packaging/macos/launchd/com.polodeck.core.plist" \
  "${STAGE}/Library/LaunchDaemons/com.polodeck.core.plist"

# Launcher app
cat >"${STAGE}/Applications/PoloDeck.app/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>PoloDeck</string>
  <key>CFBundleDisplayName</key><string>PoloDeck</string>
  <key>CFBundleIdentifier</key><string>com.polodeck.launcher</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleExecutable</key><string>PoloDeck</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
</dict>
</plist>
EOF

cat >"${STAGE}/Applications/PoloDeck.app/Contents/MacOS/PoloDeck" <<'EOF'
#!/bin/bash
export POLODECK_PORT=8080
export POLODECK_LOG_HINT="/Library/Logs/PoloDeck"
exec "/Library/Application Support/PoloDeck/bin/polodeck-open.sh"
EOF
chmod 0755 "${STAGE}/Applications/PoloDeck.app/Contents/MacOS/PoloDeck"

cp "${ROOT}/packaging/macos/pkg/scripts/postinstall" "${SCRIPTS}/postinstall"
chmod 0755 "${SCRIPTS}/postinstall"

pkgbuild \
  --root "${STAGE}" \
  --scripts "${SCRIPTS}" \
  --identifier "${IDENTIFIER}" \
  --version "${VERSION}" \
  --install-location "/" \
  "${PKG}"

shasum -a 256 "${PKG}" >"${PKG}.sha256"
echo "Built ${PKG} (unsigned). Sign + notarize before coach distribution."
