#pragma once

// Copy to secrets.h and replace every placeholder. Never commit secrets.h.
#define WIFI_SSID "YOUR_PRIVATE_WIFI_OR_HOTSPOT"
#define WIFI_PASSWORD "CHANGE_ME"

// Run ipconfig and use the Windows Wi-Fi adapter's IPv4 address.
// ESP32 cannot use localhost or the Docker service name "mosquitto".
#define MQTT_HOST "192.168.x.x"
#define MQTT_PORT 1883
#define MQTT_CLIENT_ID "heliobay-esp32-st001"
#define MQTT_USERNAME "station_device"
#define MQTT_PASSWORD "CHANGE_ME"

#define STATION_ID "ST001"
#define DEVICE_ID "ESP32-ST001"
#define BAY_ID "BAY01"

// Must match the backend secret referenced by the device credentialRef.
// Use at least 32 random characters and do not reuse the MQTT password.
#define DEVICE_HMAC_KEY "CHANGE_ME_TO_AT_LEAST_32_RANDOM_CHARACTERS"

#define NTP_SERVER_1 "pool.ntp.org"
#define NTP_SERVER_2 "time.google.com"

// Calibrate against the actual divider, sensor, charger, and battery.
#define ADC_REFERENCE_V 3.3f
#define SOLAR_DIVIDER_RATIO 2.0f
#define PLUG_SENSE_MIN_MV 1000UL
#define PLUG_SENSE_MAX_MV 1000000UL
#define MAX_CHARGING_VOLTAGE_MV 60000UL
#define MAX_CHARGING_CURRENT_MA 10000UL
#define MIN_CHARGING_CURRENT_MA 100UL
#define CURRENT_GRACE_PERIOD_MS 10000UL
#define UNPLUG_TIMEOUT_MS 30000UL

// Keep disabled until calibrated for the exact battery. This is only an
// estimate unless a real BMS supplies state of charge.
#define FULL_BATTERY_MV 0UL
#define FULL_CURRENT_MA 100UL
#define FULL_CONFIRMATION_MS 30000UL
