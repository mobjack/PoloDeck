# PoloDeck Docker deployment

This is the customer-facing installation path. It pulls versioned Linux containers and does not install Node.js,
PostgreSQL, or application dependencies on the host.

Prerequisite: Docker Desktop on Windows/macOS, or Docker Engine plus the Compose plugin on Linux.

```bash
# macOS / Linux
./deploy/install.sh install
```

```powershell
# Windows PowerShell
.\deploy\install.ps1 install
```

The installers generate `deploy/.env`, pull the selected images, apply database migrations, and expose the UI on
port 8080. The PostgreSQL port is not published to the host. Data lives in the named Docker volume
`polodeck_polodeck-postgres-data` and is preserved by the normal uninstall command.

Use a release number to pin, upgrade, or roll back:

```bash
./deploy/install.sh update 0.2.0
./deploy/install.sh rollback 0.1.0
./deploy/install.sh backup
```

The PowerShell helper supports the same commands and positional version argument.
