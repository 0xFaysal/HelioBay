#!/bin/sh
set -eu

if [ -z "${MQTT_BACKEND_USERNAME:-}" ] || [ -z "${MQTT_BACKEND_PASSWORD:-}" ] || [ -z "${MQTT_DEVICE_USERNAME:-}" ] || [ -z "${MQTT_DEVICE_PASSWORD:-}" ]; then
  echo "MQTT credentials are required" >&2
  exit 1
fi

mkdir -p /mosquitto/config /mosquitto/data /mosquitto/log
rm -f /mosquitto/config/passwords
mosquitto_passwd -b -c /mosquitto/config/passwords "$MQTT_BACKEND_USERNAME" "$MQTT_BACKEND_PASSWORD"
mosquitto_passwd -b /mosquitto/config/passwords "$MQTT_DEVICE_USERNAME" "$MQTT_DEVICE_PASSWORD"
chown mosquitto:mosquitto /mosquitto/config/passwords /mosquitto/data /mosquitto/log
chmod 600 /mosquitto/config/passwords

cat > /mosquitto/config/acl <<EOF
user $MQTT_BACKEND_USERNAME
topic read heliobay/v1/stations/+/devices/+/telemetry
topic read heliobay/v1/stations/+/devices/+/events
topic read heliobay/v1/stations/+/devices/+/acks
topic read heliobay/v1/stations/+/devices/+/status
topic write heliobay/v1/stations/+/devices/+/commands
topic write heliobay/v1/backend/+/status

user $MQTT_DEVICE_USERNAME
topic read heliobay/v1/stations/ST001/devices/ESP32-ST001/commands
topic write heliobay/v1/stations/ST001/devices/ESP32-ST001/telemetry
topic write heliobay/v1/stations/ST001/devices/ESP32-ST001/events
topic write heliobay/v1/stations/ST001/devices/ESP32-ST001/acks
topic write heliobay/v1/stations/ST001/devices/ESP32-ST001/status
EOF
chown mosquitto:mosquitto /mosquitto/config/acl

cat > /mosquitto/config/mosquitto.conf <<'EOF'
persistence true
persistence_location /mosquitto/data/
log_dest stdout
listener 1883 0.0.0.0
protocol mqtt
allow_anonymous false
password_file /mosquitto/config/passwords
acl_file /mosquitto/config/acl
max_packet_size 16384
max_queued_messages 1000
EOF

exec mosquitto -c /mosquitto/config/mosquitto.conf
