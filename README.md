# PoloDeck

**Local-first water polo scoreboard and game control platform** for the pool deck. Replaces expensive proprietary scoreboard systems with a modular, WiFi-based setup that runs without internet.

## Overview

- **Central server** is the single source of truth for game state; clients send commands and never run their own timers.
- **Browser-based** operator UIs and scoreboard displays connect over the local network.
- **Optional** future hardware (e.g. physical displays, horns) can plug into the same server.

Everything runs on the pool deck over local WiFi—no internet required.

## What the server does

- Game creation and configuration  
- Score tracking  
- Game clock and shot clock (drift-free: `remainingMs` + `lastStartedAt`, clients compute display time)  
- Period management  
- Horn triggers (event + WebSocket for clients to play sound)  
- Player rosters (per-game snapshot)  
- Player exclusions (20s, ACTIVE / ROLLED)  
- Team timeouts (2 full + 1 short per team)  
- Event history (every state change → `GameEvent` with type and JSON payload)

Updates are pushed to clients in real time via **Socket.IO** (`game:stateUpdated`, `game:hornTriggered`).

## Tech stack

| Layer       | Choices                |
|------------|-------------------------|
| Backend    | Node.js, TypeScript, Fastify, Socket.IO, Prisma, PostgreSQL, Zod, dotenv |
| Deployment | Docker, docker-compose   |

## Design

- **Local first** — Operates offline on the deck.
- **Server authoritative** — All logic on the server; validate → update DB → log event → broadcast.
- **Event-driven** — Every state change creates a `GameEvent` (e.g. `GAME_CREATED`, `GOAL_HOME`, `SHOT_CLOCK_RESET`, `EXCLUSION_STARTED`, `TIMEOUT_USED`, `HORN_TRIGGERED`).
- **Modular** — Business logic in services; routes validate and delegate.

## Repo structure

```
PoloDeck/
├── server/          # Backend API + WebSockets (Fastify, Prisma, Socket.IO)
│   ├── prisma/      # Schema and migrations
│   ├── src/         # App, routes, services, plugins
│   ├── Dockerfile
│   └── docker-compose.yml
├── ui/              # (Planned) Frontend operator and scoreboard UIs
└── README.md
```

## Quick start

From the repo root:

```bash
cd server
cp .env.example .env   # edit if needed
docker-compose up -d --build
```

Then run migrations once (if needed):

```bash
docker-compose exec polodeck-app npx prisma migrate deploy
```

- **API:** `http://localhost:3000` (see [server/README.md](server/README.md) for endpoints, Prisma, and WebSocket usage).  
- **Health:** `GET http://localhost:3000/health`

## Status

MVP scaffold: backend foundation only. No auth, no production hardening. A `ui/` directory for operator and scoreboard UIs is planned.
