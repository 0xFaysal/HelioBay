$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
docker compose --project-directory $root down
Write-Host 'Persisted volumes were preserved. Use down -v only when you intentionally want to delete local data.'
