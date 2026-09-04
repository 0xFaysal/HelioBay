#!/usr/bin/env sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
[ -f "$root/.env" ] || { echo 'Run ./scripts/setup-local.sh first.' >&2; exit 1; }
if [ "${1:-}" = '--simulator' ]; then DEVICE_MODE=simulator docker compose --project-directory "$root" --profile simulator up --build -d; else DEVICE_MODE=hardware docker compose --project-directory "$root" up --build -d; fi
docker compose --project-directory "$root" ps
echo 'HelioBay: http://localhost:8080  Firebase UI: http://localhost:4400'
