#!/usr/bin/env sh
set -eu
ip -4 -brief address show scope global
echo 'Use the private Wi-Fi/hotspot IPv4 as MQTT_HOST; never use localhost on the ESP32.'
