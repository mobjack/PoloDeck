# PoloDeck arena clients

Thin, read-only displays for the pool: **scoreboard**, **game timer**, and **shot clock**. They use the same HTTP + Socket.IO contract as the operator UI.

## URLs (after build or Docker)

| Page           | Path              |
|----------------|-------------------|
| Scoreboard     | `/` or `index.html` |
| Game timer     | `/timer.html`     |
| Shot clock     | `/shot-clock.html` |

## Configuration (local setup + optional query overrides)

On first launch, each page shows setup and stores these values in local browser storage:

- **Server origin** — e.g. `http://192.168.1.10:3000`
- **Client type** — scoreboard / timer / shot clock

You can change this anytime using the **Settings** button in the top-right.

The client now auto-selects a master game from the server:

1. first game with status `IN_PROGRESS`
2. otherwise first game with status `PENDING`
3. otherwise latest game in `/api/games`

Optional URL overrides are still supported for advanced deploys:

- `server` (origin)
- `role` (`SCOREBOARD`, `TIMER`, `SHOT_CLOCK`)
- `apiBase` / `socketUrl`

```text
http://localhost:8090/?server=http://192.168.1.10:3000&role=SCOREBOARD
```

Tip: append `?setup=1` to force opening setup.

## Local dev

```bash
cd clients/arena
cp .env.example .env   # optional
npm install
npm run dev
```

Open `http://localhost:5173` and complete setup once.

## Docker (with root compose)

Enable the `arena` profile and set LAN bind address (see repo `.env.example` and `setup.sh`):

```bash
docker compose --profile arena up -d --build
```

Arena static UI: port **8090** (default bind `127.0.0.1`; use `POLODECK_BIND_ADDRESS=0.0.0.0` for LAN).

## Device presence

On load, each client calls `POST /api/devices/check-in` as `SCOREBOARD`, `TIMER`, or `SHOT_CLOCK`, and repeats on an interval so the admin shell shows the client as connected.

## Raspberry Pi

See `pi/install-kiosk.sh` for Chromium kiosk autostart.
