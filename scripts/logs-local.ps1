param([string]$Service)
$root = Split-Path -Parent $PSScriptRoot
if ($Service) { docker compose --project-directory $root logs --follow --tail 200 $Service }
else { docker compose --project-directory $root logs --follow --tail 200 }
