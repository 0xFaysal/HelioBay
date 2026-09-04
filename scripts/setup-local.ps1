param([switch]$Force)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env'
function New-Secret([int]$Bytes = 24) {
  $buffer = New-Object byte[] $Bytes
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($buffer) } finally { $generator.Dispose() }
  return ([BitConverter]::ToString($buffer) -replace '-', '').ToLowerInvariant()
}
if ((Test-Path -LiteralPath $envFile) -and -not $Force) {
  Write-Host '.env already exists; existing local credentials were preserved.'
} else {
  $values = @(
    "POSTGRES_PASSWORD=$(New-Secret 20)",
    'MQTT_BACKEND_USERNAME=heliobay_backend',
    "MQTT_BACKEND_PASSWORD=$(New-Secret 24)",
    'MQTT_DEVICE_USERNAME=station_device',
    "MQTT_DEVICE_PASSWORD=$(New-Secret 24)",
    "SIMULATOR_HMAC_KEY=$(New-Secret 32)",
    'LOCAL_ADMIN_EMAIL=admin@heliobay.local',
    "LOCAL_ADMIN_PASSWORD=$(New-Secret 12)",
    'LOCAL_USER_EMAIL=user@heliobay.local',
    "LOCAL_USER_PASSWORD=$(New-Secret 12)",
    'PGADMIN_EMAIL=admin@heliobay.local',
    "PGADMIN_PASSWORD=$(New-Secret 16)",
    'SIMULATOR_SPEED=1',
    'SIMULATOR_SCENARIO=normal',
    'LOG_LEVEL=info'
  )
  [IO.File]::WriteAllLines($envFile, $values, [Text.UTF8Encoding]::new($false))
  Write-Host 'Generated ignored local credentials in .env.'
}

$pairs = @{}
Get-Content -LiteralPath $envFile | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { $pairs[$matches[1]] = $matches[2] } }
$firmware = Join-Path $root 'hardware\heliobay\include\secrets.h'
$firmwareText = @"
#pragma once
// Generated locally. Set Wi-Fi values and the actual laptop IPv4 before flashing.
#define WIFI_SSID "CHANGE_ME"
#define WIFI_PASSWORD "CHANGE_ME"
#define MQTT_HOST "192.168.x.x"
#define MQTT_PORT 1883
#define MQTT_CLIENT_ID "heliobay-esp32-st001"
#define MQTT_USERNAME "$($pairs.MQTT_DEVICE_USERNAME)"
#define MQTT_PASSWORD "$($pairs.MQTT_DEVICE_PASSWORD)"
#define STATION_ID "ST001"
#define DEVICE_ID "ESP32-ST001"
#define BAY_ID "BAY01"
#define DEVICE_HMAC_KEY "$($pairs.SIMULATOR_HMAC_KEY)"
#define NTP_SERVER_1 "pool.ntp.org"
#define NTP_SERVER_2 "time.google.com"
#define ADC_REFERENCE_V 3.3f
#define SOLAR_DIVIDER_RATIO 2.0f
#define PLUG_SENSE_MIN_MV 1000UL
#define PLUG_SENSE_MAX_MV 1000000UL
#define MAX_CHARGING_VOLTAGE_MV 60000UL
#define MAX_CHARGING_CURRENT_MA 10000UL
#define MIN_CHARGING_CURRENT_MA 100UL
#define CURRENT_GRACE_PERIOD_MS 10000UL
#define UNPLUG_TIMEOUT_MS 30000UL
#define FULL_BATTERY_MV 0UL
#define FULL_CURRENT_MA 100UL
#define FULL_CONFIRMATION_MS 30000UL
"@
[IO.File]::WriteAllText($firmware, $firmwareText, [Text.UTF8Encoding]::new($false))
docker compose --project-directory $root config --quiet
Write-Host 'Local setup is ready. Edit hardware\heliobay\include\secrets.h before flashing.'
Write-Host 'Local account passwords are stored only in the ignored .env file.'
