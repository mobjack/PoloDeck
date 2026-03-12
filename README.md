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
├── server/          # Backend API + WebSockets (Fastify, Prisma, Socket.IO)
│   ├── prisma/      # Schema and migrations
│   ├── src/         # App, routes, services, plugins
│   ├── postman/     # Postman collection for local testing
│   ├── Dockerfile
│   └── docker-compose.yml
├── ui/              # Frontend app (game-day admin, future operator/scoreboard views)
└── README.md
```

## Local development

From the repo root, you typically run **server** and **UI** separately during development.

### 1. Backend server

```bash
cd server
cp .env.example .env   # configure DATABASE_URL, etc.
npm install
npx prisma migrate dev
npm run dev            # Fastify on http://localhost:3000
```

Key endpoints:

- **Health:** `GET http://localhost:3000/health`
- **Games API:** `http://localhost:3000/api/games`
- **Game days API:** `http://localhost:3000/api/game-days`

You can also import `server/postman/PoloDeck-API.postman_collection.json` into Postman to exercise all endpoints (including game days, games, rosters, clocks, and horn).

### 2. Frontend UI

```bash
cd ui
npm install
cp .env.example .env   # optional; defaults to http://localhost:3000/api
npm run dev            # Vite dev server (e.g. http://localhost:5173)
```

The UI currently focuses on **game-day setup**:

- List all game days.
- Create a new game day (date, location, timing defaults).
- View a game day and see its games.
- Add/edit games for a day (home/away, level, gender, type, label).

## Docker (backend only, for now)

To run the backend stack via Docker:

```bash
cd server
cp .env.example .env   # ensure DATABASE_URL matches docker-compose setup
docker-compose up -d --build
```

Then run migrations (once per environment):

```bash
docker-compose exec polodeck-app npx prisma migrate deploy
```

- **API:** `http://localhost:3000`
- **Health:** `GET http://localhost:3000/health`

The UI will later get its own container and compose service.

## Status

Early MVP scaffold:

- Backend: game model, timing, rosters, exclusions, timeouts, device check-in, event log.
- Game-day planning and game metadata APIs are in place.
- UI: first pass game-day admin UI built with React (no auth, no production hardening yet).

