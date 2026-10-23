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
3. Build and start Postgres, the API, and the web app.
4. Apply the database migrations.

### Choosing the bind address

When the script runs interactively it asks:

```text
Use LAN binding (0.0.0.0)? [y/N]
```

- Answer **N** (or just press Enter) to bind to `127.0.0.1`. The stack is then reachable **only from this machine** at <http://localhost:8080>. This is the safest default for testing on a single computer.
- Answer **y** to bind to `0.0.0.0`. The ports are published on **all network interfaces**, so operator devices on the same pool LAN can reach the stack at `http://<this-machine-LAN-IP>:8080`. Future ESP32 shot clocks and scoreboards will use this address too. Use this for a real pool-deck deployment.

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
| `./setup/setup.sh start` | Start the stack; creates missing containers without forcing a rebuild |
| `./setup/setup.sh stop` | Stop the stack while keeping its containers |
| `./setup/setup.sh restart` | Restart Postgres, the API, and the web app |
| `./setup/setup.sh migrate` | Run `prisma migrate deploy` in the API container |
| `./setup/setup.sh update` | Fast-forward the Git checkout, refresh/rebuild images, recreate the stack, and migrate |
| `./setup/setup.sh up` | Build and start containers (compatibility/development command) |
| `./setup/setup.sh down` | Stop and remove containers and the Compose network; database data remains in its volume |
| `./setup/setup.sh build` | `docker compose build` |
| `./setup/setup.sh logs` | Follow container logs |
| `./setup/setup.sh restart-api` | Rebuild and restart just the API container |
| `./setup/setup.sh help` | Show usage |

### Day-to-day service recovery

The management commands are safe to run from the repository root and do not remove the PostgreSQL
data volume:

```bash
./setup/setup.sh start
./setup/setup.sh stop
./setup/setup.sh restart
./setup/setup.sh migrate
./setup/setup.sh update
```

`restart` is the quickest first step when a service becomes unresponsive. `update` uses
`git pull --ff-only`, so it refuses to rewrite local commits or resolve a divergent branch. It then
pulls current base images, rebuilds the local PoloDeck images, recreates the services, and applies
database migrations.

### Non-interactive / CI

Set these environment variables to skip the prompts:

| Variable | Purpose |
| --- | --- |
| `POLODECK_BIND_ADDRESS=0.0.0.0` | Skip the LAN prompt; use with `install`/`up` |
| `POLODECK_SETUP_SKIP_START=1` | `config`/`install`: write `.env` only, do not run compose |

Example:

```bash
POLODECK_BIND_ADDRESS=0.0.0.0 ./setup/setup.sh install
```

## LAN access

By default the published ports bind to `127.0.0.1` (localhost only). To let operator devices reach the stack, choose LAN binding when prompted, or set `POLODECK_BIND_ADDRESS=0.0.0.0` in `setup/.env`. Physical shot clocks and scoreboards will be available in a future release and will use the same binding.

The web-app nginx container proxies `/api/`, `/socket.io/`, and `/health` to the API, so clients only need port **8080**. Future ESP32 firmware configuration is documented in [`../esp32/README.md`](../esp32/README.md).

> Only expose `0.0.0.0` on networks you trust.

## Manual Docker Compose (optional)

The script just wraps Docker Compose. You can run it directly:

```bash
cd setup && docker compose up -d --build
```

## Limitations

PoloDeck's limitations are Docker's limitations on your platform. As long as Docker can build and run the containers, PoloDeck "should" work.
