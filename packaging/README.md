# PoloDeck native packaging

Coach-facing distribution for **macOS (Apple Silicon)** and **Ubuntu 22.04/24.04 amd64**.

## Install guides (coaches / volunteers)

- **macOS:** [INSTALL-MAC.md](INSTALL-MAC.md)
- **Linux (Ubuntu):** [INSTALL-LINUX.md](INSTALL-LINUX.md)

Developers continue to use Docker via [`../setup/setup.sh`](../setup/setup.sh). This tree builds an additional native Core that bundles Node + PostgreSQL and runs as a background service.

## Quick build

```bash
# From repo root
./packaging/scripts/build-runtime.sh
# Optional: POLODECK_PG_TARBALL=… or POLODECK_USE_SYSTEM_PG_FOR_RUNTIME=1

./packaging/scripts/build-app.sh

# Linux (on Debian/Ubuntu with dpkg-deb):
./packaging/scripts/build-deb.sh

# macOS:
./packaging/scripts/build-pkg.sh
```

Artifacts land in `packaging/dist/` with `.sha256` checksums.

## Layout

| Path | Role |
|------|------|
| `shared/supervisor/` | Start Postgres, migrate, run Core |
| `shared/launcher/` | Health-check + open browser |
| `shared/env/` | Env matrix + templates |
| `linux/` | systemd units + `.deb` scripts |
| `macos/` | LaunchDaemon + pkg postinstall |
| `scripts/` | Build + smoke test |

## Paths at runtime

**Linux:** `/opt/polodeck` (app), `/etc/polodeck` (config), `/var/lib/polodeck` (data), `/var/log/polodeck`

**macOS:** `/Library/Application Support/PoloDeck`, logs in `/Library/Logs/PoloDeck`, LaunchDaemon `com.polodeck.core`

## First run

See the platform install guides above. In short: install the package → open PoloDeck → complete the browser setup wizard → optionally connect Pis with `curl -fsSL 'http://<LAN-IP>:8080/kb' | sudo bash`.

## Signing (macOS)

Prototype packages are **unsigned**. Production requires Apple Developer ID signing + notarization before Gatekeeper will allow normal installs.

## TLS

See [docs/TLS.md](docs/TLS.md) for the phased HTTPS plan and BYOD limitations.
