# PoloDeck setup on Linux and macOS

PoloDeck runs entirely in Docker. Whatever Docker supports on your machine is what PoloDeck supports.

## Prerequisites

- **Linux:** Docker Engine + the Docker Compose plugin.
  - Install guide: <https://docs.docker.com/engine/install/>
  - Make sure your user can run Docker (either add yourself to the `docker` group or use `sudo`).
- **macOS:** Docker Desktop for Mac.
  - Download: <https://www.docker.com/products/docker-desktop/>
  - Start Docker Desktop and wait until it reports the engine is running.
- **Bash** (default on both platforms).

Verify Docker is ready:

```bash
docker version
docker compose version
```

Both commands should succeed.

## Quick start

From the repository root:

```bash
./setup/setup.sh
```

This first-time install will:

1. Create `setup/.env` from `setup/.env.example` if it does not exist.
2. Prompt whether to bind the ports to your LAN (`0.0.0.0`) or localhost only (`127.0.0.1`). See [Choosing the bind address](#choosing-the-bind-address) below for how to answer.
3. Optionally configure an APT proxy for Raspberry Pi kiosk installs. This is only useful for developers who install/reimage Raspberry Pis repeatedly (it caches apt packages so re-installs are faster); most users can safely skip it.
4. Build and start Postgres, the API, and the web app.
5. Apply the database migrations.

### Choosing the bind address

When the script runs interactively it asks:

```text
Use LAN binding (0.0.0.0)? [y/N]
```

- Answer **N** (or just press Enter) to bind to `127.0.0.1`. The stack is then reachable **only from this machine** at <http://localhost:8080>. This is the safest default for testing on a single computer.
- Answer **y** to bind to `0.0.0.0`. The ports are published on **all network interfaces**, so other PCs and Raspberry Pi kiosks on the same pool LAN can reach the stack at `http://<this-machine-LAN-IP>:8080`. Use this for a real pool-deck deployment.

Your answer is written to `POLODECK_BIND_ADDRESS` in `setup/.env`.

You can accomplish the same thing without the prompt in two ways:

- **Set it up front** so the script does not prompt:

```bash
POLODECK_BIND_ADDRESS=0.0.0.0 ./setup/setup.sh
```

- **Edit `setup/.env` directly** and then restart the stack:

```bash
# in setup/.env
POLODECK_BIND_ADDRESS=0.0.0.0
```

```bash
./setup/setup.sh up   # re-reads .env and republishes the ports
```

To find this machine's LAN IP (for the URL other devices use): run `ip addr` on Linux or `ipconfig getifaddr en0` on macOS.

> Only bind to `0.0.0.0` on networks you trust.

When it finishes:

- **Web app:** <http://localhost:8080>
- **API:** <http://localhost:3000>
- **Health:** <http://localhost:3000/health>

## Command reference

Run any of these from the repository root:

| Command | Description |
| --- | --- |
| `./setup/setup.sh` | First-time install: copy `.env`, prompt for LAN bind, start the stack, run migrations |
| `./setup/setup.sh install` | Same as no args (non-interactive if no usable console) |
| `./setup/setup.sh config` | Only create/update `setup/.env` |
| `./setup/setup.sh up` | Build and start containers |
| `./setup/setup.sh down` | Stop and remove containers |
| `./setup/setup.sh migrate` | Run `prisma migrate deploy` in the API container |
| `./setup/setup.sh build` | `docker compose build` |
| `./setup/setup.sh logs` | Follow container logs |
| `./setup/setup.sh restart-api` | Rebuild and restart just the API container |
| `./setup/setup.sh help` | Show usage |

### Non-interactive / CI

Set these environment variables to skip the prompts:

| Variable | Purpose |
| --- | --- |
| `POLODECK_BIND_ADDRESS=0.0.0.0` | Skip the LAN prompt; use with `install`/`up` |
| `POLODECK_PI_APT_PROXY=...` | Skip the Pi APT proxy prompt; passed to the API for `GET /kb` installs |
| `POLODECK_SETUP_SKIP_START=1` | `config`/`install`: write `.env` only, do not run compose |

Example:

```bash
POLODECK_BIND_ADDRESS=0.0.0.0 ./setup/setup.sh install
```

## LAN and Raspberry Pi access

By default the published ports bind to `127.0.0.1` (localhost only). To let other machines on your pool network (other PCs, Raspberry Pi kiosks) reach the stack, choose LAN binding when prompted, or set `POLODECK_BIND_ADDRESS=0.0.0.0` in `setup/.env`.

The web-app nginx container proxies `/api/` and `/socket.io/` to the API, so clients usually only need port **8080**. Install a Pi with:

```bash
curl -fsSL 'http://<LAN-IP>:3000/kb' | sudo bash
```

(optional query `?host=<LAN-IP>` if the `Host` header would be wrong). See [`../pi/README.md`](../pi/README.md).

> Only expose `0.0.0.0` on networks you trust.

## Manual Docker Compose (optional)

The script just wraps Docker Compose. You can run it directly:

```bash
cd setup && docker compose up -d --build
```

## Limitations

PoloDeck's limitations are Docker's limitations on your platform. As long as Docker can build and run the containers, PoloDeck "should" work.
