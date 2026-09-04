param([switch]$Simulator)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $root '.env'))) { throw 'Run .\scripts\setup-local.ps1 first.' }
if ($Simulator) { $env:DEVICE_MODE='simulator'; docker compose --project-directory $root --profile simulator up --build -d }
else { $env:DEVICE_MODE='hardware'; docker compose --project-directory $root up --build -d }
docker compose --project-directory $root ps
Write-Host 'HelioBay: http://localhost:8080  Firebase UI: http://localhost:4400'
