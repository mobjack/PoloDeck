# PoloDeck native vs Docker environment matrix

Pinned runtimes for native packages:

| Component | Version | Notes |
|-----------|---------|--------|
| Node.js | **20.18.1** LTS | Bundled under `runtime/node` |
| PostgreSQL | **16.6** | Bundled under `runtime/postgres`; data dir separate |
| Prisma | matches `api/package.json` | `migrate deploy` at service start |

## Native package environment

Set by installer / supervisor (coach never edits these by hand):

| Variable | Typical native value | Purpose |
|----------|----------------------|---------|
| `NODE_ENV` | `production` | |
| `PORT` | `8080` | Single HTTP port (API + UI + `/kb`) |
| `HOST` | `127.0.0.1` or `0.0.0.0` | From first-run access choice |
| `POLODECK_UI_PORT` | `8080` | Same as `PORT` for Pi `/kb` URLs |
| `POLODECK_WEB_ROOT` | `…/app/web` | Enables Fastify static SPA |
| `POLODECK_REQUIRE_SETUP` | `true` | Blocks app until wizard completes |
| `POLODECK_VERSION` | package version | Reported by `/health` |
| `POLODECK_SESSION_SECRET` | random | Cookie signing |
| `POLODECK_CONFIG_ENV_PATH` | config env file | Wizard can update `HOST` |
| `DATABASE_URL` | local socket/TCP | Points at private Postgres |
| `PGDATA` | data directory | Private Postgres data |
| `POLODECK_BACKUP_DIR` | backups directory | Pre-migrate dumps |

## Docker / developer (unchanged)

| Variable | Typical | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | API only |
| UI | nginx `:8080` | Separate container |
| `POLODECK_WEB_ROOT` | unset | nginx serves UI |
| `POLODECK_REQUIRE_SETUP` | unset | Open API as today |
| `POLODECK_BIND_ADDRESS` | compose publish bind | Host firewall for ports |

See also `setup/.env.example` and `api/.env.example`.
