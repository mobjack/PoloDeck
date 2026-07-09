# PoloDeck setup on Windows

PoloDeck runs entirely in Docker, so on Windows the only real requirement is a working Docker installation. Whatever Docker Desktop supports on your Windows machine is what PoloDeck supports.

## Prerequisites

- **Windows 10/11** (64-bit).
- **Docker Desktop for Windows** with the **WSL 2 backend** (recommended). Docker Desktop with Hyper-V also works.
  - Download: <https://www.docker.com/products/docker-desktop/>
  - After install, start Docker Desktop and wait until it reports **"Engine running"**.
- **PowerShell 5.1+** (ships with Windows) or PowerShell 7+.

Verify Docker is ready in a PowerShell window:

```powershell
docker version
docker compose version
```

Both commands should succeed. If `docker` is not recognized, make sure Docker Desktop is running and that you opened a new terminal after installing it.

## Quick start

From the repository root in PowerShell:

```powershell
.\setup\setup.ps1
```

This first-time install will:

1. Create `setup\.env` from `setup\.env.example` if it does not exist.
2. Prompt whether to bind the ports to your LAN (`0.0.0.0`) or localhost only (`127.0.0.1`).
3. Optionally configure an APT proxy for Raspberry Pi kiosk installs.
4. Build and start Postgres, the API, and the web app.
5. Apply the database migrations.

When it finishes:

- **Web app:** <http://localhost:8080>
- **API:** <http://localhost:3000>
- **Health:** <http://localhost:3000/health>

## If PowerShell blocks the script

Windows may block local scripts depending on your execution policy. If you see an error like *"running scripts is disabled on this system"*, run it with a one-off bypass:

```powershell
powershell -ExecutionPolicy Bypass -File setup\setup.ps1
```

Or allow scripts for the current session only:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup\setup.ps1
```

## Command reference

Run any of these from the repository root:

| Command | Description |
| --- | --- |
| `.\setup\setup.ps1` | First-time install: copy `.env`, prompt for LAN bind, start the stack, run migrations |
| `.\setup\setup.ps1 install` | Same as no args (non-interactive if no usable console) |
| `.\setup\setup.ps1 config` | Only create/update `setup\.env` |
| `.\setup\setup.ps1 up` | Build and start containers |
| `.\setup\setup.ps1 down` | Stop and remove containers |
| `.\setup\setup.ps1 migrate` | Run `prisma migrate deploy` in the API container |
| `.\setup\setup.ps1 build` | `docker compose build` |
| `.\setup\setup.ps1 logs` | Follow container logs |
| `.\setup\setup.ps1 restart-api` | Rebuild and restart just the API container |
| `.\setup\setup.ps1 help` | Show usage |

### Non-interactive / CI

Set these environment variables to skip the prompts:

| Variable | Purpose |
| --- | --- |
| `POLODECK_BIND_ADDRESS=0.0.0.0` | Skip the LAN prompt; use with `install`/`up` |
| `POLODECK_PI_APT_PROXY=...` | Skip the Pi APT proxy prompt; passed to the API for `GET /kb` installs |
| `POLODECK_SETUP_SKIP_START=1` | `config`/`install`: write `.env` only, do not run compose |

Example (PowerShell session variable):

```powershell
$env:POLODECK_BIND_ADDRESS = '0.0.0.0'
.\setup\setup.ps1 install
```

## LAN and Raspberry Pi access

By default the published ports bind to `127.0.0.1` (localhost only). To let other machines on your pool network (other PCs, Raspberry Pi kiosks) reach the stack, choose LAN binding when prompted, or set `POLODECK_BIND_ADDRESS=0.0.0.0` in `setup\.env`.

The web-app nginx container proxies `/api/` and `/socket.io/` to the API, so clients usually only need port **8080**.

> Only expose `0.0.0.0` on networks you trust. On Windows you may also be prompted by Windows Defender Firewall to allow Docker/`vpnkit` through — allow it on private networks so LAN clients can connect.

## Manual Docker Compose (optional)

The script just wraps Docker Compose. You can run it directly:

```powershell
cd setup
docker compose up -d --build
```

## Limitations

PoloDeck's Windows limitations are Docker's Windows limitations. As long as Docker Desktop can build and run the containers on your machine, PoloDeck will work.
