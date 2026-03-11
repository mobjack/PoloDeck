## PoloDeck Server

PoloDeck is a **local-first water polo scoreboard and game control platform** designed to run on a pool deck using affordable hardware. This `server/` project is the authoritative backend for managing water polo games, clocks, scores, rosters, exclusions, timeouts, horns, and event history.

The backend is designed to run entirely on a local network without internet access. The server holds the authoritative game state; clients send commands and subscribe to updates via WebSockets.

---

## Technology Stack

- **Runtime**: Node.js (TypeScript)
- **Web framework**: Fastify
- **Realtime**: Socket.IO
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Validation**: Zod
- **Config**: dotenv
- **Containerization**: Docker, docker-compose

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Docker and docker-compose (for containerized setup)

### Environment configuration

1. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

2. Adjust values as needed, especially `DATABASE_URL` if you are not using the provided `docker-compose.yml`.

---

## Running with Docker

From the `server/` directory:

```bash
docker-compose up --build
```

This will:

- Start a PostgreSQL 16 container on port `5432`.
- Build and start the PoloDeck server container on port `3000`.

Once containers are running, apply migrations and seed data in the server container (one-time for development):

```bash
docker-compose exec server npx prisma migrate dev --name init
docker-compose exec server npm run db:seed
```

---

## Running Locally (without Docker)

1. Ensure you have a PostgreSQL instance running and create a database (e.g. `polodeck`).
2. Update `DATABASE_URL` in `.env` to point to your Postgres instance.
3. Install dependencies:

```bash
npm install
```

4. Apply Prisma migrations and generate the client:

```bash
npx prisma migrate dev --name init
npx prisma generate
```

5. (Optional) Seed example data:

```bash
npm run db:seed
```

6. Start the development server:

```bash
npm run dev
```

The server will listen on `http://localhost:3000`.

---

## Prisma & Database

### Schema location

The Prisma schema is defined in:

- `prisma/schema.prisma`

Key models:

- `Game`, `Score`, `GameClock`, `ShotClock`
- `GameEvent` (event log)
- `Player`, `PlayerExclusion`
- `TeamTimeoutState`

### Common Prisma commands

- **Run migrations in dev**:

```bash
npx prisma migrate dev --name init
```

- **Generate Prisma client**:

```bash
npx prisma generate
```

- **Open Prisma Studio**:

```bash
npx prisma studio
```

---

## HTTP API Overview

All API endpoints are exposed under `/api` except for health.

### Health

- **GET** `/health`  
  Returns simple server status.

Example:

```bash
curl http://localhost:3000/health
```

---

### Game Management

- **POST** `/api/games`  
  Create a new game.

Request body:

```json
{
  "homeTeamName": "Home",
  "awayTeamName": "Away",
  "totalPeriods": 4,
  "gameClockDurationMs": 480000,
  "shotClockDurationMs": 30000
}
```

Example:

```bash
curl -X POST http://localhost:3000/api/games \
  -H "Content-Type: application/json" \
  -d '{"homeTeamName":"Home","awayTeamName":"Away","totalPeriods":4,"gameClockDurationMs":480000,"shotClockDurationMs":30000}'
```

- **GET** `/api/games`  
  List games.

- **GET** `/api/games/:id`  
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

### Score Commands

- **POST** `/api/games/:id/score/home/increment`
- **POST** `/api/games/:id/score/home/decrement`
- **POST** `/api/games/:id/score/away/increment`
- **POST** `/api/games/:id/score/away/decrement`

Example:

```bash
curl -X POST http://localhost:3000/api/games/<GAME_ID>/score/home/increment
```

---

### Game Clock Commands

- **POST** `/api/games/:id/game-clock/start`
- **POST** `/api/games/:id/game-clock/stop`
- **POST** `/api/games/:id/game-clock/set`

Request body for `set`:

```json
{
  "remainingMs": 120000
}
```

---

### Shot Clock Commands

- **POST** `/api/games/:id/shot-clock/start`
- **POST** `/api/games/:id/shot-clock/stop`
- **POST** `/api/games/:id/shot-clock/reset`
- **POST** `/api/games/:id/shot-clock/set`

Request body for `set`:

```json
{
  "remainingMs": 30000
}
```

---

### Period Commands

- **POST** `/api/games/:id/period/advance`

---

### Player Roster Endpoints

- **POST** `/api/games/:id/roster/home/player`
- **POST** `/api/games/:id/roster/away/player`
- **GET** `/api/games/:id/roster`

Request body for adding a player:

```json
{
  "capNumber": 7,
  "playerName": "Player Name"
}
```

Example:

```bash
curl -X POST http://localhost:3000/api/games/<GAME_ID>/roster/home/player \
  -H "Content-Type: application/json" \
  -d '{"capNumber":7,"playerName":"Alice"}'
```

---

### Exclusion Endpoints

- **POST** `/api/games/:id/exclusions`

Request body:

```json
{
  "playerId": "<PLAYER_ID>",
  "durationMs": 20000
}
```

- **GET** `/api/games/:id/exclusions/active`
- **POST** `/api/games/:id/exclusions/:exclusionId/clear`

---

### Timeout Endpoints

- **POST** `/api/games/:id/timeouts/home/full`
- **POST** `/api/games/:id/timeouts/home/short`
- **POST** `/api/games/:id/timeouts/away/full`
- **POST** `/api/games/:id/timeouts/away/short`
- **GET** `/api/games/:id/timeouts`

Example:

```bash
curl -X POST http://localhost:3000/api/games/<GAME_ID>/timeouts/home/full
```

---

### Horn Endpoint

- **POST** `/api/games/:id/horn/trigger`

Optional request body:

```json
{
  "reason": "manual"
}
```

Example:

```bash
curl -X POST http://localhost:3000/api/games/<GAME_ID>/horn/trigger \
  -H "Content-Type: application/json" \
  -d '{"reason":"manual"}'
```

---

## WebSocket Events

The server uses Socket.IO for realtime updates.

- **Namespace**: default
- **Room per game**: `game:{gameId}`

### Client-to-server events

- **`game:join`**

  - Payload: `{ "gameId": "<GAME_ID>" }`
  - Behavior: Joins the room for that game.

- **`game:leave`**

  - Payload: `{ "gameId": "<GAME_ID>" }`
  - Behavior: Leaves the room for that game.

### Server-to-client events

- **`game:stateUpdated`**

  - Payload: `{ "gameId": "<GAME_ID>", "aggregate": <full game aggregate> }`
  - Emitted after any state change (score, clocks, period, roster, exclusions, timeouts, etc.).

- **`game:hornTriggered`**

  - Payload: `{ "gameId": "<GAME_ID>", "reason": "<string|undefined>" }`
  - Emitted when `/api/games/:id/horn/trigger` is called.

### Example client usage (JavaScript)

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");

socket.emit("game:join", { gameId: "<GAME_ID>" });

socket.on("game:stateUpdated", ({ gameId, aggregate }) => {
  console.log("State updated for game", gameId, aggregate);
});

socket.on("game:hornTriggered", ({ gameId, reason }) => {
  console.log("Horn triggered for game", gameId, "reason:", reason);
});
```

---

## Notes and Future Enhancements

- This scaffold focuses on core game operations and event logging, not authentication or multi-tenant concerns.
- Player exclusion and timeout rules may be refined further to match detailed competition regulations.
- Additional event types can be added to `GameEventType` as the system evolves.


