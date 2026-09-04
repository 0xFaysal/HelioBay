#!/bin/sh
set -eu
mkdir -p /data
if [ -f /data/firebase-export-metadata.json ]; then
  exec firebase emulators:start --project demo-heliobay --only auth --import=/data --export-on-exit=/data
fi
exec firebase emulators:start --project demo-heliobay --only auth --export-on-exit=/data
