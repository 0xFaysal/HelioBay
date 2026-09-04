$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
docker compose --project-directory $root ps
try { Invoke-RestMethod -Uri 'http://localhost:8080/health/ready' -TimeoutSec 5 | ConvertTo-Json -Compress } catch { Write-Warning 'Application readiness endpoint is unavailable.' }
