#!/usr/bin/env bash
# Assemble a Debian package for Ubuntu 22.04/24.04 amd64.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="$(tr -d '[:space:]' <"${ROOT}/packaging/VERSION")"
ARCH="${POLODECK_DEB_ARCH:-amd64}"
STAGE="${ROOT}/packaging/dist/deb-stage"
APP="${ROOT}/packaging/dist/app"
RUNTIME="${ROOT}/packaging/dist/runtime-linux-x64"
OUT_DIR="${ROOT}/packaging/dist"
DEB="${OUT_DIR}/polodeck_${VERSION}_${ARCH}.deb"

if [[ ! -d "${APP}/api" ]]; then
  "${ROOT}/packaging/scripts/build-app.sh" "${APP}"
fi
if [[ ! -d "${RUNTIME}/node/bin" ]]; then
  echo "Build runtime first: packaging/scripts/build-runtime.sh" >&2
  exit 1
fi

rm -rf "${STAGE}"
mkdir -p \
  "${STAGE}/DEBIAN" \
  "${STAGE}/opt/polodeck" \
  "${STAGE}/etc/polodeck" \
  "${STAGE}/lib/systemd/system" \
  "${STAGE}/usr/share/applications" \
  "${STAGE}/usr/bin"

rsync -a "${APP}/" "${STAGE}/opt/polodeck/app/"
rsync -a "${RUNTIME}/node/" "${STAGE}/opt/polodeck/runtime/node/"
rsync -a "${RUNTIME}/postgres/" "${STAGE}/opt/polodeck/runtime/postgres/"
install -m 0755 "${ROOT}/packaging/shared/supervisor/"*.sh "${STAGE}/opt/polodeck/bin/"
install -m 0755 "${ROOT}/packaging/shared/launcher/polodeck-open.sh" "${STAGE}/opt/polodeck/bin/"
ln -sf /opt/polodeck/bin/polodeck-open.sh "${STAGE}/usr/bin/polodeck"

install -m 0644 "${ROOT}/packaging/linux/systemd/polodeck-db.service" "${STAGE}/lib/systemd/system/"
install -m 0644 "${ROOT}/packaging/linux/systemd/polodeck.service" "${STAGE}/lib/systemd/system/"
install -m 0644 "${ROOT}/packaging/linux/polodeck.desktop" "${STAGE}/usr/share/applications/"
install -m 0644 "${ROOT}/packaging/shared/env/polodeck.env.example" "${STAGE}/etc/polodeck/polodeck.env"

SIZE_KB="$(du -sk "${STAGE}" | awk '{print $1}')"

cat >"${STAGE}/DEBIAN/control" <<EOF
Package: polodeck
Version: ${VERSION}
Section: misc
Priority: optional
Architecture: ${ARCH}
Maintainer: PoloDeck <polodeck@localhost>
Depends: adduser, libc6
Installed-Size: ${SIZE_KB}
Description: PoloDeck Core — local water polo scoreboard server
 Native background service with bundled runtime. Browser UI on port 8080.
EOF

cp "${ROOT}/packaging/linux/debian/postinst" "${STAGE}/DEBIAN/postinst"
cp "${ROOT}/packaging/linux/debian/prerm" "${STAGE}/DEBIAN/prerm"
cp "${ROOT}/packaging/linux/debian/postrm" "${STAGE}/DEBIAN/postrm"
chmod 0755 "${STAGE}/DEBIAN/postinst" "${STAGE}/DEBIAN/prerm" "${STAGE}/DEBIAN/postrm"

mkdir -p "${OUT_DIR}"
dpkg-deb --build "${STAGE}" "${DEB}"
sha256sum "${DEB}" >"${DEB}.sha256"
echo "Built ${DEB}"
