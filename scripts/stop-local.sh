#!/usr/bin/env sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
docker compose --project-directory "$root" down
echo 'Persisted volumes were preserved. down -v intentionally deletes local data.'
