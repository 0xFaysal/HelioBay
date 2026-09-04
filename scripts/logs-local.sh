#!/usr/bin/env sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ -n "${1:-}" ]; then docker compose --project-directory "$root" logs -f --tail 200 "$1"; else docker compose --project-directory "$root" logs -f --tail 200; fi
