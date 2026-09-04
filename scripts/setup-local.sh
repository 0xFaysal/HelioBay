#!/usr/bin/env sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
file="$root/.env"
secret() { openssl rand -hex "$1"; }
if [ -f "$file" ]; then
  echo '.env already exists; existing credentials were preserved.'
else
  umask 077
  {
    echo "POSTGRES_PASSWORD=$(secret 20)"
    echo 'MQTT_BACKEND_USERNAME=heliobay_backend'
    echo "MQTT_BACKEND_PASSWORD=$(secret 24)"
    echo 'MQTT_DEVICE_USERNAME=station_device'
    echo "MQTT_DEVICE_PASSWORD=$(secret 24)"
    echo "SIMULATOR_HMAC_KEY=$(secret 32)"
    echo 'LOCAL_ADMIN_EMAIL=admin@heliobay.local'
    echo "LOCAL_ADMIN_PASSWORD=$(secret 12)"
    echo 'LOCAL_USER_EMAIL=user@heliobay.local'
    echo "LOCAL_USER_PASSWORD=$(secret 12)"
    echo 'PGADMIN_EMAIL=admin@heliobay.local'
    echo "PGADMIN_PASSWORD=$(secret 16)"
    echo 'SIMULATOR_SPEED=1'
    echo 'SIMULATOR_SCENARIO=normal'
    echo 'LOG_LEVEL=info'
  } > "$file"
  echo 'Generated ignored local credentials in .env.'
fi
docker compose --project-directory "$root" config --quiet
echo 'Copy hardware/heliobay/include/secrets.example.h to secrets.h and use values from .env.'
