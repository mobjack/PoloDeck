# PoloDeck

**Local-first water polo scoreboard and game control platform** for the pool deck. Replaces expensive proprietary scoreboard systems with a modular, WiFi-based setup that runs without internet.

Everything runs on the pool deck over local WiFi—no internet required.

**Operator commands:** [Command list](COMMAND_LIST.md) — scoring shortcuts for the game sheet (`sq`, `eq`, goals, timeouts, etc.).

## Overview

- **Central server** is the single source of truth for game state; clients send commands and never run their own timers.
- **Browser-based UIs** provide game-day setup, operator controls, and display simulation over the local network.
- **Physical shot clocks and scoreboards** will be available in a future release, using ESP32 controllers. Browser simulators are the displays available today.

## What the server does

- Game creation and configuration
- **Game day planning** (date, location, timing defaults, list of games)
- Score tracking
- Game clock and shot clock (drift-free: `remainingMs` + `lastStartedAt`, clients compute display time)
- Period management
- Horn triggers (events are sent to browser clients and will be included when ESP32 displays ship)
- Player rosters (per-game snapshot, string cap numbers like `1`, `10`, `A`, `B`)
- Player exclusions (20s, ACTIVE / ROLLED)
- Team timeouts (2 full + 1 short per team)
- Event history (every state change → `GameEvent` with type and JSON payload)

Updates are pushed to clients in real time via **Socket.IO** (`game:stateUpdated`, `game:hornTriggered`).

## Tech stack

| Layer      | Choices                                                                  |
|------------|--------------------------------------------------------------------------|
| Backend    | Node.js, TypeScript, Fastify, Socket.IO, Prisma, PostgreSQL, Zod, dotenv |
| Frontend   | Vite, React, TypeScript                                                  |
| Deployment | Docker, docker-compose                                                   |

## Design

- **Local first** — Operates offline on the deck.
- **Server authoritative** — All logic on the server; validate → update DB → log event → broadcast.
- **Event-driven** — Every state change creates a `GameEvent` (e.g. `GAME_CREATED`, `GOAL_HOME`, `SHOT_CLOCK_RESET`, `EXCLUSION_STARTED`, `TIMEOUT_USED`, `HORN_TRIGGERED`).
- **Modular** — Business logic in services; routes validate and delegate.

## Repo structure

```text
PoloDeck/
├── api/             # Backend API + WebSockets (Fastify, Prisma, Socket.IO)
│   ├── prisma/    # Schema and migrations
│   ├── src/       # App, routes, services, plugins
│   ├── postman/   # Postman collection for local testing
│   └── Dockerfile
├── web-app/       # Browser UI (game-day admin, operator views)
├── deploy/        # Customer Compose bundle and macOS/Linux + Windows installers
├── esp32/         # Future ESP32-S3 display-controller firmware (PlatformIO, built in Docker)
├── setup/         # Docker Compose + source-build helpers (Postgres, API, web-app)
│   ├── docker-compose.yml
│   ├── setup.sh            # Linux/macOS install helper
│   ├── setup.ps1           # Windows (PowerShell) install helper
│   ├── SETUP-WINDOWS.md    # Windows setup guide
│   ├── SETUP-LINUX-MAC.md  # Linux/macOS setup guide
│   └── .env.example
├── COMMAND_LIST.md   # Game sheet scoring commands (printable reference)
└── README.md
```

## Development

The supported development environment is Docker Compose; no host Node.js or PostgreSQL installation is required.

```bash
./setup/setup.sh
```

On Windows PowerShell use `./setup/setup.ps1`. These helpers build the current source, start the development
Compose stack, and apply migrations.

## Customer installation

Released installer bundles contain a production Compose file that pulls versioned multi-platform images from
GitHub Container Registry. Customers install Docker first, then run one of two helpers:

```bash
# macOS / Linux
./deploy/install.sh install
```

```powershell
# Windows
.\deploy\install.ps1 install
```

The deployment helper supports `update`, versioned `rollback`, `backup`, `logs`, `status`, and a non-destructive
`uninstall`. See [`deploy/README.md`](deploy/README.md).

## Docker development stack

Everything runs in Docker, so the only prerequisite is a working Docker install. Platform-specific setup guides:

- **Windows:** [`setup/SETUP-WINDOWS.md`](setup/SETUP-WINDOWS.md) (uses `setup/setup.ps1`)
- **Linux / macOS:** [`setup/SETUP-LINUX-MAC.md`](setup/SETUP-LINUX-MAC.md) (uses `setup/setup.sh`)

From the repo root, one command creates `setup/.env` (if missing), prompts for LAN binding when your terminal is interactive, starts Postgres + API + web-app, and applies Prisma migrations:

```bash
# Linux / macOS
./setup/setup.sh
```

```powershell
# Windows (PowerShell)
.\setup\setup.ps1
```

Other useful commands (Linux/macOS shown; on Windows use `.\setup\setup.ps1 <command>`):

```bash
./setup/setup.sh config    # only write/update setup/.env
./setup/setup.sh start     # start existing services
./setup/setup.sh stop      # stop services without removing them
./setup/setup.sh restart   # restart all services
./setup/setup.sh migrate   # prisma migrate deploy (API container must be running)
./setup/setup.sh update    # pull, rebuild/recreate, and migrate
./setup/setup.sh help
```

Use `restart` first when the Docker services become unresponsive. The `update` command performs a
fast-forward-only Git pull, rebuilds the images with current base images, recreates the stack, and
applies database migrations. Neither command deletes the PostgreSQL data volume.

Manual compose (equivalent to what the scripts use):

```bash
cd setup && docker compose up -d --build
```

- **API:** `http://localhost:3000`
- **Web app:** `http://localhost:8080`
- **Health:** `GET http://localhost:3000/health`

**Pool LAN:** Set `POLODECK_BIND_ADDRESS=0.0.0.0` so operator devices on the pool network can reach the web container on port **8080**. Future ESP32 shot clocks and scoreboards will use the same address. Nginx proxies `/api/`, `/socket.io/`, and `/health` to the API container; PostgreSQL stays private to the Docker network. See [`esp32/README.md`](esp32/README.md). Only expose PoloDeck on networks you trust.

## Status

Early MVP scaffold:

- Backend: game model, timing, rosters, exclusions, timeouts, device check-in, event log.
- Game-day planning and game metadata APIs are in place.
- UI: game-day administration, operator controls, and browser display simulators.
- Hardware: physical shot clocks and scoreboards will be available in a future release. The ESP32-S3 protocol and pre-panel firmware scaffold are in the repo; HUB75 integration follows panel inspection.
