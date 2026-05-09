# PoloDeck

**Local-first water polo scoreboard and game control platform** for the pool deck. Replaces expensive proprietary scoreboard systems with a modular, WiFi-based setup that runs without internet.

Everything runs on the pool deck over local WiFi—no internet required.

## Overview

- **Central server** is the single source of truth for game state; clients send commands and never run their own timers.
- **Browser-based UIs** for game-day setup, operators, and scoreboard displays connect over the local network.
- **Optional hardware** (e.g. physical displays, horns) can plug into the same server over the same APIs.

## What the server does

- Game creation and configuration
- **Game day planning** (date, location, timing defaults, list of games)
- Score tracking
- Game clock and shot clock (drift-free: `remainingMs` + `lastStartedAt`, clients compute display time)
- Period management
- Horn triggers (event + WebSocket for clients to play sound)
- Player rosters (per-game snapshot, string cap numbers like `1`, `10`, `A`, `B`)
- Player exclusions (20s, ACTIVE / ROLLED)
- Team timeouts (2 full + 1 short per team)
- Event history (every state change → `GameEvent` with type and JSON payload)

Updates are pushed to clients in real time via **Socket.IO** (`game:stateUpdated`, `game:hornTriggered`).

## Tech stack

| Layer       | Choices                                                                 |
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
├── pi/            # Raspberry Pi kiosk scripts (served under /kiosk/ from the web-app image)
├── setup/         # Docker Compose + install helper (Postgres, API, web-app)
│   ├── docker-compose.yml
│   ├── setup.sh
│   └── .env.example
└── README.md
```

## Local development

From the repo root, you typically run **api** and **web-app** separately during development.

### 1. Backend API

```bash
cd api
cp .env.example .env   # configure DATABASE_URL, etc.
npm install
npx prisma migrate dev
npm run dev            # Fastify on http://localhost:3000
```

Key endpoints:

- **Health:** `GET http://localhost:3000/health`
- **Games API:** `http://localhost:3000/api/games`
- **Game days API:** `http://localhost:3000/api/game-days`

You can also import `api/postman/PoloDeck-API.postman_collection.json` into Postman to exercise all endpoints (including game days, games, rosters, clocks, and horn).

### 2. Web app

```bash
cd web-app
npm install
cp .env.example .env   # optional; defaults to http://localhost:3000/api
npm run dev            # Vite dev server (e.g. http://localhost:5173)
```

The UI currently focuses on **game-day setup**:

- List all game days.
- Create a new game day (date, location, timing defaults).
- View a game day and see its games.
- Add/edit games for a day (home/away, level, gender, type, label).

## Docker (full stack)

From the repo root, one command creates `setup/.env` (if missing), prompts for LAN binding when your terminal is interactive, starts Postgres + API + web-app, and applies Prisma migrations:

```bash
./setup/setup.sh
```

Other useful commands:

```bash
./setup/setup.sh config    # only write/update setup/.env
./setup/setup.sh up        # start stack without the full install/migrate flow
./setup/setup.sh migrate   # prisma migrate deploy (API container must be running)
./setup/setup.sh down
./setup/setup.sh help
```

Manual compose (equivalent to what the script uses):

```bash
cd setup && docker compose up -d --build
```

- **API:** `http://localhost:3000`
- **Web app:** `http://localhost:8080`
- **Health:** `GET http://localhost:3000/health`

**LAN / Raspberry Pi:** By default, published ports bind to `127.0.0.1` only. Run `./setup/setup.sh` and choose LAN binding, or set `POLODECK_BIND_ADDRESS=0.0.0.0` in `setup/.env`, so other machines on the pool network can reach the stack. The **web-app** nginx container proxies `/api/` and `/socket.io/` to the API, so browsers and kiosk Pis usually use port **8080** only (same-origin). Install a Pi with `curl -fsSL 'http://<LAN-IP>:3000/kb' | sudo bash` (optional query `?host=<LAN-IP>` if the `Host` header would be wrong). See [`pi/README.md`](pi/README.md). Only expose `0.0.0.0` on networks you trust.

## Status

Early MVP scaffold:

- Backend: game model, timing, rosters, exclusions, timeouts, device check-in, event log.
- Game-day planning and game metadata APIs are in place.
- UI: first pass game-day admin UI built with React (no auth, no production hardening yet).

