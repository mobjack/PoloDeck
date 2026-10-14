#Requires -Version 5.1
[CmdletBinding()]
param(
  [Parameter(Position = 0)][string]$Command = 'install',
  [Parameter(Position = 1)][string]$Version = ''
)

$ErrorActionPreference = 'Stop'
$DeployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path $DeployDir '.env'
$EnvExample = Join-Path $DeployDir '.env.example'
$ComposeFile = Join-Path $DeployDir 'compose.yml'

function Show-Usage {
  @'
PoloDeck Docker installer

  .\deploy\install.ps1 install             Configure, pull, migrate, and start PoloDeck
  .\deploy\install.ps1 update [VERSION]    Pull and start latest or a specific version
  .\deploy\install.ps1 rollback VERSION    Return to a previously published version
  .\deploy\install.ps1 start|stop|status   Manage the stack
  .\deploy\install.ps1 logs                Follow application logs
  .\deploy\install.ps1 backup              Create a PostgreSQL dump under deploy\backups
  .\deploy\install.ps1 uninstall           Stop containers; preserve the database volume

Docker Desktop and Docker Compose are prerequisites.
'@ | Write-Output
}

function Invoke-Compose {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & docker compose --project-directory $DeployDir --env-file $EnvFile -f $ComposeFile @Arguments
  if ($LASTEXITCODE -ne 0) { throw "docker compose failed with exit code $LASTEXITCODE" }
}

function Test-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker is required: https://docs.docker.com/get-docker/'
  }
  & docker compose version | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Docker Compose is required.' }
  & docker info | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Docker is installed but the engine is not running.' }
}

function Set-EnvValue([string]$Key, [string]$Value) {
  $lines = if (Test-Path $EnvFile) { @(Get-Content $EnvFile) } else { @() }
  $found = $false
  $next = foreach ($line in $lines) {
    if ($line -cmatch "^$([regex]::Escape($Key))=") {
      "$Key=$Value"
      $found = $true
    } else { $line }
  }
  if (-not $found) { $next += "$Key=$Value" }
  [IO.File]::WriteAllText($EnvFile, (($next -join "`n") + "`n"))
}

function Get-EnvValue([string]$Key) {
  foreach ($line in Get-Content $EnvFile) {
    if ($line -cmatch "^$([regex]::Escape($Key))=(.*)$") { return $Matches[1] }
  }
  return ''
}

function New-RandomHex([int]$Bytes = 24) {
  $buffer = New-Object byte[] $Bytes
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
  return (($buffer | ForEach-Object { $_.ToString('x2') }) -join '')
}

function Confirm-Environment {
  if (-not (Test-Path $EnvFile)) {
    Copy-Item $EnvExample $EnvFile
    Set-EnvValue 'POSTGRES_PASSWORD' (New-RandomHex)
    Write-Output "Created $EnvFile with a generated database password."
  }
}

function Wait-ForHealth {
  $port = Get-EnvValue 'POLODECK_PORT'
  if (-not $port) { $port = '8080' }
  for ($i = 1; $i -le 30; $i++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/health" -TimeoutSec 3
      if ($response.StatusCode -eq 200) {
        Write-Output "PoloDeck is ready at http://localhost:$port"
        return
      }
    } catch { Start-Sleep -Seconds 2 }
  }
  throw 'PoloDeck did not become healthy. Run .\deploy\install.ps1 logs.'
}

function Install-Version([string]$RequestedVersion) {
  Confirm-Environment
  if ($RequestedVersion) { Set-EnvValue 'POLODECK_VERSION' $RequestedVersion.TrimStart('v') }
  Invoke-Compose config --quiet
  Invoke-Compose pull
  Invoke-Compose up -d postgres
  Invoke-Compose run --rm polodeck-api npx prisma migrate deploy
  Invoke-Compose up -d --remove-orphans
  Wait-ForHealth
}

if ($Command.ToLowerInvariant() -in @('-h', '--help', 'help')) {
  Show-Usage
  exit 0
}

Test-Docker
switch ($Command.ToLowerInvariant()) {
  'install' { Install-Version '' }
  'update' { Install-Version $(if ($Version) { $Version } else { 'latest' }) }
  'rollback' {
    if (-not $Version) { throw 'rollback requires a version' }
    Install-Version $Version
  }
  'start' { Confirm-Environment; Invoke-Compose up -d; Wait-ForHealth }
  'stop' { Confirm-Environment; Invoke-Compose stop }
  'status' { Confirm-Environment; Invoke-Compose ps }
  'logs' { Confirm-Environment; Invoke-Compose logs -f }
  'backup' {
    Confirm-Environment
    $backupDir = Join-Path $DeployDir 'backups'
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    $file = Join-Path $backupDir ("polodeck-{0}.sql" -f (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ'))
    $user = Get-EnvValue 'POSTGRES_USER'
    $database = Get-EnvValue 'POSTGRES_DB'
    & docker compose --project-directory $DeployDir --env-file $EnvFile -f $ComposeFile exec -T postgres pg_dump -U $user $database | Set-Content -Encoding utf8 $file
    if ($LASTEXITCODE -ne 0) { throw 'Database backup failed.' }
    Write-Output "Backup written to $file"
  }
  'uninstall' {
    Confirm-Environment
    Invoke-Compose down
    Write-Output "Containers removed. Database volume and $EnvFile were preserved."
  }
  default { throw "Unknown command: $Command" }
}
