# Prompt

You are my senior staff engineer helping design the backend for a project called **PoloDeck**.

Your task is to generate the **initial backend server foundation** for this system.

Create this backend inside a new `server/` directory because this repository will later also contain a `ui/` directory for frontend applications.

The goal is to build a **clean, extensible foundation** that models real water polo game operations while remaining simple enough for an MVP.

Do NOT implement a full production system yet — this is a strong scaffold.

---

# Project Overview

PoloDeck is a **local-first water polo scoreboard and game control platform** designed to run on a pool deck using affordable hardware.

The system replaces expensive proprietary water polo scoreboard systems with a modular software platform.

The architecture consists of:

- a central server
- browser-based operator interfaces
- browser-based scoreboard displays
- optional future hardware devices

The system must operate **without internet access** using a local WiFi network.

The server is the **authoritative source of truth** for all game state.

Clients never run independent timers.

---

# Core System Responsibilities

The PoloDeck server must manage:

- game creation and configuration
- score tracking
- game clock
- shot clock
- period management
- horn triggers
- player rosters
- player exclusions
- team timeout inventory
- event history

The server broadcasts updates to connected clients via WebSockets.

---

# Technology Stack

Use the following stack exactly unless a strong technical reason exists otherwise.

Backend

- Node.js
- TypeScript
- Fastify (preferred over Express)
- Socket.IO for realtime communication
- Prisma ORM
- PostgreSQL
- Zod for validation
- dotenv for configuration

Deployment

- Docker
- docker-compose

---

# Architecture Principles

## Local First

The system must operate without internet access.

Everything runs locally on the pool deck.

---

## Server Authoritative State

All game logic runs on the server.

Clients send commands.

Server validates the command, updates state, logs an event, and broadcasts updates.

---

## Event Driven History

Every state-changing action creates a GameEvent record.

Examples:

- GAME_CREATED
- GOAL_HOME
- GOAL_AWAY
- GAME_CLOCK_STARTED
- GAME_CLOCK_STOPPED
- SHOT_CLOCK_RESET
- PERIOD_ADVANCED
- EXCLUSION_STARTED
- EXCLUSION_CLEARED
- TIMEOUT_USED
- HORN_TRIGGERED

Events include a JSON payload for flexible metadata.

---

## Modular Design

Organize code so business logic lives in services rather than route handlers.

Routes should validate input and call services.

---

# Core Domain Models

Use Prisma ORM to define these models.

---

## Game

Represents a water polo match.

Fields

- id
- homeTeamName
- awayTeamName
- currentPeriod
- totalPeriods
- status
- createdAt
- updatedAt

---

## Score

Tracks goals.

Fields

- id
- gameId
- homeScore
- awayScore

---

## GameClock

Tracks the main game timer.

Fields

- id
- gameId
- durationMs
- remainingMs
- running
- lastStartedAt

---

## ShotClock

Tracks possession timer.

Fields

- id
- gameId
- durationMs
- remainingMs
- running
- lastStartedAt

---

## GameEvent

Event log for every state change.

Fields

- id
- gameId
- eventType
- payload (JSON)
- source
- createdAt

---

# Player Roster

Each game has its own roster snapshot.

This avoids the complexity of a global player database.

---

## Player

Fields

- id
- gameId
- teamSide
- capNumber
- playerName
- createdAt
- updatedAt

teamSide enum values

- HOME
- AWAY

---

# Player Exclusions

Track exclusions per player.

---

## PlayerExclusion

Fields

- id
- gameId
- playerId
- teamSide
- durationMs (always 20 seconds or until goal is scored; if the end of a period is reached the player is still in the exclusion area until the 20 seconds is done.)
- remainingMs
- running
- status (Note that there are two types of exclustions, 1. is a  exclustion like going to the hockey penalty box. 2. Is a pentalty where a pentalty shot is given to the other team. A player will only get a maximum of exclustions and penalties. Once 3 are given by a referee, the player is rolled and is removed from the match).
- endedAt
- createdAt
- updatedAt

status enum values

- ACTIVE
- ROLLED

Each exclusion must also create a GameEvent.

---

# Team Timeouts

Each team gets:

- 2 full timeouts
- 1 thirty-second timeout

---

## TeamTimeoutState

Fields

- id
- gameId
- teamSide
- fullTimeoutsRemaining
- shortTimeoutsRemaining
- createdAt
- updatedAt

Initialize each team with:

- fullTimeoutsRemaining = 2
- shortTimeoutsRemaining = 1

Server must reject timeout usage when none remain.

Timeout usage must generate a GameEvent.

---

# Horn System

The system must support audible horn signals.

Horn triggers occur for:

- end of period
- shot clock expiration
- manual horn

Initial implementation will trigger a horn event and allow connected clients to play sound.

Create a route:

POST /api/games/:id/horn/trigger

Each horn trigger must create a GameEvent and emit a websocket event.

---

# Clock Design

Do NOT implement clocks as simple decrementing loops.

Instead store:

- remainingMs
- running
- lastStartedAt

Clients compute display time using these values.

This prevents drift.

---

# Required API Endpoints

All endpoints should live under `/api`.

---

## Health

GET `/health`

Returns simple server status.

---

## Game Management

POST `/api/games`

Create new game.

Payload

- homeTeamName
- awayTeamName
- totalPeriods
- gameClockDurationMs
- shotClockDurationMs

---

GET `/api/games`

List games.

---

GET `/api/games/:id`

Return full game aggregate including:

- game
- score
- gameClock
- shotClock
- timeout states
- roster
- active exclusions
- recent events

---

# Score Commands

POST `/api/games/:id/score/home/increment`

POST `/api/games/:id/score/home/decrement`

POST `/api/games/:id/score/away/increment`

POST `/api/games/:id/score/away/decrement`

---

# Game Clock Commands

POST `/api/games/:id/game-clock/start`

POST `/api/games/:id/game-clock/stop`

POST `/api/games/:id/game-clock/set`

Payload

remainingMs

---

# Shot Clock Commands

POST `/api/games/:id/shot-clock/start`

POST `/api/games/:id/shot-clock/stop`

POST `/api/games/:id/shot-clock/reset`

POST `/api/games/:id/shot-clock/set`

---

# Period Commands

POST `/api/games/:id/period/advance`

---

# Player Roster Endpoints

POST `/api/games/:id/roster/home/player`

POST `/api/games/:id/roster/away/player`

GET `/api/games/:id/roster`

Payload example

- capNumber
- playerName

---

# Exclusion Endpoints

POST `/api/games/:id/exclusions`

Payload

- playerId
- durationMs optional

GET `/api/games/:id/exclusions/active`

POST `/api/games/:id/exclusions/:exclusionId/clear`

---

# Timeout Endpoints

POST `/api/games/:id/timeouts/home/full`

POST `/api/games/:id/timeouts/home/short`

POST `/api/games/:id/timeouts/away/full`

POST `/api/games/:id/timeouts/away/short`

GET `/api/games/:id/timeouts`

---

# WebSocket System

Use Socket.IO.

Clients may join a room named:

game:{gameId}

After any state change broadcast:

event: `game:stateUpdated`

Payload: full updated game aggregate.

Also broadcast:

event: `game:hornTriggered`

---

# Service Layer

Create a GameService responsible for business logic.

Routes should call the service.

Service must:

- validate state changes
- update database
- create GameEvent records
- return updated game aggregate
- trigger websocket broadcasts

---

# Validation

Use Zod schemas for validating requests.

Place schemas in a dedicated directory.

---

# Project Structure

Create the following layout.

server/

package.json
tsconfig.json
Dockerfile
.env.example

prisma/

schema.prisma
seed.ts

src/

app.ts
server.ts

config/

env.ts

plugins/

prisma.ts
socket.ts

routes/

health.ts
games.ts

services/

game.service.ts

schemas/

game.schemas.ts

lib/

clock.ts

types/

socket.ts

docker-compose.yml

README.md

---

# Docker Requirements

Provide:

Dockerfile for server.

docker-compose.yml with services:

postgres
server

Ports

server: 3000
postgres: 5432

Use environment variables for DB connection.

---

# README Requirements

The README must include:

- project overview
- technology stack
- how to run with Docker
- how to run locally without Docker
- Prisma migration instructions
- example API curl commands
- explanation of websocket events

---

# Important Constraints

Do NOT add:

authentication
microservices
redis
kafka
message brokers
complex background workers

Keep this a clean MVP scaffold.

---

# Output Format

First show the full project file tree.

Then provide the contents of all key files including:

- package.json
- tsconfig.json
- prisma schema
- main server files
- routes
- services
- docker files
- README

If the response is too large, output in multiple sections.

Prioritize correctness and clarity over cleverness.
