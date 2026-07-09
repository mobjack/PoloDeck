#Requires -Version 5.1
<#
PoloDeck - configure .env and run Docker Compose from setup/ (Windows/PowerShell).
Feature parity with setup/setup.sh.
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$Command = 'install'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$SetupDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Split-Path -Parent $SetupDir
$EnvFile   = Join-Path $SetupDir '.env'
$EnvExample = Join-Path $SetupDir '.env.example'
$ComposeFile = Join-Path $SetupDir 'docker-compose.yml'

function Invoke-Compose {
  # Runs `docker compose -f <file> --project-directory <setup> <args...>` in $SetupDir.
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$ComposeArgs)
  Push-Location $SetupDir
  try {
    & docker compose -f $ComposeFile --project-directory $SetupDir @ComposeArgs
    return $LASTEXITCODE
  } finally {
    Pop-Location
  }
}

function Show-Usage {
  @'
PoloDeck setup (Docker, Windows/PowerShell)

  .\setup\setup.ps1               First-time: copy .env from example, prompt for LAN bind, start stack + migrations
  .\setup\setup.ps1 install       Same as no args (non-interactive if no usable console)
  .\setup\setup.ps1 config        Only create/update .env (interactive when console available)
  .\setup\setup.ps1 up            Build and start containers (uses existing .env or copies example)
  .\setup\setup.ps1 down          Stop and remove containers
  .\setup\setup.ps1 migrate       Run prisma migrate deploy in the API container
  .\setup\setup.ps1 build         docker compose build
  .\setup\setup.ps1 logs          docker compose logs -f
  .\setup\setup.ps1 restart-api   Rebuild and restart the API container (after api code changes)

Environment (non-interactive / CI):

  POLODECK_BIND_ADDRESS=0.0.0.0   Skip LAN prompt; use with install/up
  POLODECK_PI_APT_PROXY=...       Skip Pi APT proxy prompts; passed to API for GET /kb installs
  POLODECK_SETUP_SKIP_START=1     config/install: write .env only, do not run compose

If PowerShell blocks the script, run:

  powershell -ExecutionPolicy Bypass -File setup\setup.ps1

From repo root, quick start:

  .\setup\setup.ps1
'@ | Write-Output
}

function Test-DockerAvailable {
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $docker) {
    Write-Error "docker was not found on PATH. Install Docker Desktop for Windows and ensure 'docker compose version' works. See setup/SETUP-WINDOWS.md."
    exit 1
  }
}

function Set-EnvValue {
  # Replace-or-append KEY=value in the given env file (mirrors upsert_env).
  param(
    [Parameter(Mandatory)][string]$Key,
    [Parameter(Mandatory)][AllowEmptyString()][string]$Value,
    [Parameter(Mandatory)][string]$File
  )
  $lines = @()
  $found = $false
  if (Test-Path -LiteralPath $File) {
    foreach ($line in Get-Content -LiteralPath $File) {
      if ($line -cmatch "^$([regex]::Escape($Key))=") {
        $lines += "$Key=$Value"
        $found = $true
      } else {
        $lines += $line
      }
    }
  }
  if (-not $found) {
    $lines += "$Key=$Value"
  }
  # Write LF-terminated lines so the file stays compatible with Compose / the container.
  $content = ($lines -join "`n") + "`n"
  [System.IO.File]::WriteAllText($File, $content)
}

function Confirm-EnvFile {
  # mirrors ensure_env_file
  if (-not (Test-Path -LiteralPath $EnvExample)) {
    Write-Error "error: missing $EnvExample"
    exit 1
  }
  if (-not (Test-Path -LiteralPath $EnvFile)) {
    Copy-Item -LiteralPath $EnvExample -Destination $EnvFile
    Write-Output "Created $EnvFile from .env.example"
  }
}

function Test-CanPrompt {
  # Interactive only when a real console is attached and the session is not driven non-interactively.
  return ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected)
}

function Get-BindAddress {
  $bindDefault = '127.0.0.1'
  if (-not (Test-CanPrompt)) {
    $envBind = [Environment]::GetEnvironmentVariable('POLODECK_BIND_ADDRESS')
    if ([string]::IsNullOrEmpty($envBind)) { return $bindDefault }
    return $envBind
  }
  Write-Output ''
  Write-Output 'Bind address for API (:3000) and web-app (:8080) on this machine.'
  Write-Output '  127.0.0.1 - localhost only (default)'
  Write-Output '  0.0.0.0   - all interfaces (other PCs / Raspberry Pis on your pool LAN)'
  Write-Output ''
  $lan = Read-Host 'Use LAN binding (0.0.0.0)? [y/N]'
  if ($lan -and ($lan.ToLower() -eq 'y' -or $lan.ToLower() -eq 'yes')) {
    return '0.0.0.0'
  }
  return $bindDefault
}

function Get-PiAptProxy {
  if (-not (Test-CanPrompt)) {
    $envProxy = [Environment]::GetEnvironmentVariable('POLODECK_PI_APT_PROXY')
    if ($null -eq $envProxy) { return '' }
    return $envProxy
  }
  Write-Output ''
  Write-Output 'Optional: default APT HTTP proxy for Raspberry Pi kiosk installs (Apt-Cacher NG).'
  Write-Output 'When set, curl .../kb | sudo bash passes this to the Pi before apt-get.'
  Write-Output ''
  $useProxy = Read-Host 'Configure default APT proxy for Pi installers? [y/N]'
  if (-not ($useProxy -and ($useProxy.ToLower() -eq 'y' -or $useProxy.ToLower() -eq 'yes'))) {
    return ''
  }
  $urlIn = Read-Host 'APT proxy base URL (e.g. http://192.168.1.10:3142)'
  if ($null -eq $urlIn) { return '' }
  return $urlIn.Trim()
}

function Set-EnvInteractive {
  Confirm-EnvFile
  $bind = Get-BindAddress
  Set-EnvValue -Key 'POLODECK_BIND_ADDRESS' -Value $bind -File $EnvFile
  Write-Output "Updated POLODECK_BIND_ADDRESS=$bind in $EnvFile"
  $proxy = Get-PiAptProxy
  Set-EnvValue -Key 'POLODECK_PI_APT_PROXY' -Value $proxy -File $EnvFile
  Write-Output "Updated POLODECK_PI_APT_PROXY in $EnvFile"
}

function Invoke-Migrate {
  $code = Invoke-Compose exec -T polodeck-api npx prisma migrate deploy
  if ($code -ne 0) {
    Write-Error "error: prisma migrate deploy failed (exit $code)"
    exit $code
  }
}

function Invoke-MigrateInstall {
  # One-off container: works right after `up` even if the long-running API is still restarting.
  for ($i = 1; $i -le 15; $i++) {
    $code = Invoke-Compose run --rm polodeck-api npx prisma migrate deploy
    if ($code -eq 0) { return }
    Write-Output "Migrate not ready yet, retrying in 2s... ($i/15)"
    Start-Sleep -Seconds 2
  }
  Write-Error 'error: prisma migrate deploy failed after retries'
  exit 1
}

function Invoke-Up {
  Confirm-EnvFile
  $code = Invoke-Compose up -d --build
  if ($code -ne 0) { exit $code }
}

function Invoke-Install {
  Confirm-EnvFile
  if (Test-CanPrompt) {
    $bind = Get-BindAddress
    Set-EnvValue -Key 'POLODECK_BIND_ADDRESS' -Value $bind -File $EnvFile
    Write-Output "Wrote POLODECK_BIND_ADDRESS to $EnvFile"
    $proxy = Get-PiAptProxy
    Set-EnvValue -Key 'POLODECK_PI_APT_PROXY' -Value $proxy -File $EnvFile
    Write-Output "Wrote POLODECK_PI_APT_PROXY to $EnvFile"
  } else {
    $bind = [Environment]::GetEnvironmentVariable('POLODECK_BIND_ADDRESS')
    if ([string]::IsNullOrEmpty($bind)) { $bind = '127.0.0.1' }
    Set-EnvValue -Key 'POLODECK_BIND_ADDRESS' -Value $bind -File $EnvFile
    Write-Output "Non-interactive: POLODECK_BIND_ADDRESS=$bind (set env to override)"
    $proxyVar = [Environment]::GetEnvironmentVariable('POLODECK_PI_APT_PROXY')
    if ($null -ne $proxyVar) {
      Set-EnvValue -Key 'POLODECK_PI_APT_PROXY' -Value $proxyVar -File $EnvFile
      Write-Output "Non-interactive: POLODECK_PI_APT_PROXY=$proxyVar (from environment)"
    }
  }

  if ([Environment]::GetEnvironmentVariable('POLODECK_SETUP_SKIP_START') -eq '1') {
    Write-Output 'POLODECK_SETUP_SKIP_START=1 - not starting containers.'
    return
  }

  Write-Output ''
  Write-Output 'Building and starting stack (Postgres, API, web-app)...'
  $code = Invoke-Compose up -d --build
  if ($code -ne 0) { exit $code }

  Write-Output ''
  Write-Output 'Applying database migrations...'
  Invoke-MigrateInstall

  Write-Output ''
  Write-Output 'PoloDeck is up.'
  Write-Output '  API:      http://localhost:3000'
  Write-Output '  Web app:  http://localhost:8080'
  Write-Output '  Health:   http://localhost:3000/health'
  Write-Output ''
  Write-Output "Repo: $RepoRoot"
}

switch ($Command.ToLower()) {
  { $_ -in @('-h', '--help', 'help') } {
    Show-Usage
  }
  'config' {
    Test-DockerAvailable
    Write-Output "PoloDeck - configure $EnvFile"
    Set-EnvInteractive
  }
  'install' {
    Test-DockerAvailable
    Write-Output 'PoloDeck - install (Docker)'
    Invoke-Install
  }
  'up' {
    Test-DockerAvailable
    Confirm-EnvFile
    Invoke-Up
    Write-Output ''
    Write-Output 'Stack started. Apply migrations if this is a new database:'
    Write-Output '  .\setup\setup.ps1 migrate'
  }
  'down' {
    Test-DockerAvailable
    $code = Invoke-Compose down
    if ($code -ne 0) { exit $code }
  }
  'migrate' {
    Test-DockerAvailable
    Confirm-EnvFile
    Invoke-Migrate
  }
  'build' {
    Test-DockerAvailable
    Confirm-EnvFile
    $code = Invoke-Compose build
    if ($code -ne 0) { exit $code }
  }
  'logs' {
    Test-DockerAvailable
    $code = Invoke-Compose logs -f
    if ($code -ne 0) { exit $code }
  }
  'restart-api' {
    Test-DockerAvailable
    Confirm-EnvFile
    Write-Output 'Rebuilding and restarting polodeck-api...'
    $code = Invoke-Compose up -d --build polodeck-api
    if ($code -ne 0) { exit $code }
  }
  default {
    Write-Error "error: unknown command: $Command"
    Show-Usage
    exit 1
  }
}
