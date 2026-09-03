# MQTT and ESP32 protocol v1

The browser uses authenticated REST and WebSocket endpoints. Only backend/device processes connect to MQTT. The current prototype is ST001 → ESP32-ST001 → BAY01 → relay 1. Bay/device/station foreign keys enforce assignment; the start service resolves a bay's assigned controller. Relay uniqueness remains station-wide for compatibility with the current prototype.

## Topics and delivery

Here `{stationId}` is the station **code** (ST001), and `{deviceId}` is its **public device ID** (ESP32-ST001), not the database IDs used in most REST paths.

| Topic suffix under `heliobay/v1/stations/{stationId}/devices/{deviceId}/` | Publisher | Meaning |
| --- | --- | --- |
| `telemetry` | Device | Validated per-bay measurements, including final metering |
| `events` | Device | Emergency stop or sensor fault |
| `acks` | Device | Command acknowledgement |
| `status` | Device | Online heartbeat and offline last-will |
| `commands` | Backend | START, STOP, EMERGENCY_STOP, diagnostic TEST, safe RESTART |

Use MQTT 5 and QoS 1. Commands, telemetry, events and ACKs must not be retained. Online status may be retained by a device, but the gateway accepts only fresh non-retained online status; retained offline wills are hints. The simulator publishes an online status again on each connection. Configure the backend with a stable, unique MQTT_CLIENT_ID and a persistent broker: its session expiry is one day, PUBACK follows durable acceptance, and pending commands retry every two seconds until expiry. Restart backoff is 1, 2, 4, 8, 16, then 30 seconds. Do not run two workers with the same MQTT client ID.

Accepted messages enter a transactional DeviceInbox with sequence/snapshot changes. Business processing and inbox deletion follow; accepted work survives a process restart and is idempotent on replay. Samples default to one every five seconds per device plus final readings, with 30-day retention. Last snapshots are retained separately. Run one IoT worker/API process for this foundation: realtime fan-out and inbox draining are process-local. Before scaling replicas, introduce worker leadership, distributed fan-out and shared HTTP rate limits.

## Identity, secrets and production broker

Each envelope is `{ "payload": {...}, "signature": "64 lowercase hex characters" }`.

`signature = HMAC-SHA256(deviceSecret, UTF8(topic + "\n" + canonicalJSON(payload)))`

Canonical JSON sorts object keys in ascending ASCII order recursively, preserves array order, uses JSON escaping and has no extra whitespace. Measurements are integers; large counters are decimal strings. `src/modules/iot/protocol.ts` is the reference encoder. A device row stores only a reference such as `secret://env/ESP32_ST001_HMAC_KEY`; inject the corresponding random key (at least 32 characters) into the backend and the provisioned device through protected configuration. Never return or commit it.

The gateway checks the signature, stored station/device assignment, bay ownership, data source, schema, device state, sequence and timestamp. MQTT broker identity is enforced through broker ACLs; subscriber deliveries do not expose the original publisher username, so topic checks alone are insufficient. Use a different broker username/password and HMAC key per device. The backend has its own broker account. Require TLS (`mqtts://`, certificate verification enabled), disable anonymous access, and restrict each device to its own paths. Example ACL is in `infra/mosquitto/production.acl.example`; configure the broker's password file and certificates out of band. The development broker is intentionally anonymous and loopback-only; never use that configuration for deployment.

Send a fresh signed online status on boot before telemetry. Use a persistent, monotonically increasing device-wide sequence across reboots, not a per-bay counter. Counters contain 1–18 decimal digits. A fresh boot ID is required on reboot; only online status can establish it. Payload timestamps must be UTC ISO timestamps, no more than five seconds ahead and no older than the configured heartbeat timeout (at most 60 seconds). Synchronize the device clock. Older per-bay timestamps and duplicate/lower sequences are rejected. An offline will must match the current boot ID; it cannot settle a session.

## ESP32 payload examples

These are unsigned **payloads**, not complete MQTT envelopes. Replace timestamps/IDs/counters, then sign with the scoped topic and device's provisioned key. `LIVE_HARDWARE` must match the stored device data source; never relabel simulator output.

```json
{
  "kind": "telemetry",
  "bootId": "boot-20260903-1",
  "sequence": "10002",
  "at": "2026-09-03T12:00:01.000Z",
  "dataSource": "LIVE_HARDWARE",
  "bayId": "BAY01",
  "sessionId": "session-id-from-start-command",
  "online": true,
  "plugConnected": true,
  "relayOn": true,
  "batterySenseAvailable": true,
  "vehicleBatteryMv": 50000,
  "vehicleBatteryPercent": 62,
  "batteryPercentageEstimated": true,
  "solarVoltageMv": 50000,
  "solarCurrentMa": 20000,
  "solarPowerW": 1000,
  "chargingVoltageMv": 50000,
  "chargingCurrentMa": 20000,
  "chargingPowerW": 1000,
  "energyMWh": "277778",
  "stationBatteryPercent": 80,
  "source": "SOLAR",
  "faultCodes": [],
  "final": false
}
```

Voltage uses mV; current mA; power W; energy mWh (`1 kWh = 1,000,000 mWh`). Battery percentages are explicitly estimated, and may be null when unavailable. Source mode is SOLAR, STORAGE or GRID. Data provenance is LIVE_HARDWARE, ESTIMATED, DIGITAL_TWIN or SIMULATOR. Estimated/digital-twin sources cannot authorize billing sessions. Simulator charging requires explicit development enablement and a demo account. Public station/bay responses and session receipts expose provenance without exposing session-private measurements to public rooms.

All measurements must be nonnegative integers. The schema bounds voltage at 1,000,000 mV, current at 2,000,000 mA, and power at 1,000,000 W; tighter device/bay safety limits apply during charging. Cumulative session energy cannot decrease or grow beyond the configured power/time plausibility envelope. Schema-invalid packets are rejected; valid but electrically unsafe readings trigger a safety stop. Firmware must independently trip on invalid sensors and electrical hazards even if backend validation rejects a packet.

```json
{
  "commandId": "command-id",
  "type": "START",
  "sessionId": "session-id",
  "stationId": "ST001",
  "deviceId": "ESP32-ST001",
  "bayId": "BAY01",
  "relayChannel": 1,
  "maxCostMinor": "1000",
  "maxEnergyMWh": "400000",
  "maxDurationSeconds": 14400,
  "telemetryIntervalMs": 1000,
  "issuedAt": "2026-09-03T12:00:00.000Z",
  "expiresAt": "2026-09-03T12:00:10.000Z",
  "dataSource": "LIVE_HARDWARE"
}
```

The backend publishes signed envelopes. Firmware must verify signature/identity/channel/expiry and persist the authorization before energizing the relay. The energy example assumes 2,500 minor units/kWh and 1,000 minor units reserved. `maxCostMinor` is in poisha. Never reset delivered energy or re-energize a completed session when START is replayed. TEST is a relay-off diagnostic, not a relay pulse.

```json
{
  "kind": "ack", "bootId": "boot-20260903-1", "sequence": "10001",
  "at": "2026-09-03T12:00:00.500Z", "dataSource": "LIVE_HARDWARE",
  "commandId": "command-id", "sessionId": "session-id",
  "accepted": true, "relayOn": true, "energyMWh": "0"
}
```

A rejected START uses `accepted:false`, the observed relay state and energy, optionally `failureCode`. An explicit rejection with relay off and zero energy while START_PENDING can release the hold. An ACK timeout does **not** prove that charging never started.

STOP/EMERGENCY_STOP commands contain command/session/station/device/bay IDs, relay channel, issued/expiry timestamps and the stored stop reason. A STOP ACK is only an acknowledgement. Publish another signed telemetry message with the same session ID, cumulative energy, `relayOn:false` and `final:true` after physically confirming relay-off. Preserve and resend the final meter record on reconnect/reconciliation; duplicate finalization cannot debit twice. For safe RESTART/TEST, sessionId is null and the command must not energize a relay.

```json
{"kind":"status","bootId":"boot-20260903-1","sequence":"10000","at":"2026-09-03T12:00:00.000Z","dataSource":"LIVE_HARDWARE","online":true}
```

```json
{"kind":"event","bootId":"boot-20260903-1","sequence":"10003","at":"2026-09-03T12:00:02.000Z","dataSource":"LIVE_HARDWARE","bayId":"BAY01","event":"EMERGENCY_STOP","code":"EMERGENCY_STOP"}
```

## Plug sensing and safety thresholds

No IR sensor is used. A valid battery-sense voltage establishes connection when sense is available; disappearance means unplugged. Without sense, the reported plug signal is used. Current above the charging threshold plus relay-on means charging. Zero current with valid sense remains connected; a full voltage/current combination is full, not unplugged. Percentage remains estimated. Device thresholds are merged with bay overrides; defaults and validation are in `thresholdsSchema`.

| Threshold | Default |
| --- | --- |
| senseMinMv / senseMaxMv | 1,000 / 1,000,000 |
| fullBatteryMv | 0 (voltage-based full detection disabled until calibrated) |
| fullCurrentMa / chargingCurrentMa | 100 / 100 |
| maxVoltageMv / maxCurrentMa | 900,000 / 500,000 |
| stopLatencyMs | 2,000 |

These broad defaults are protocol-development limits, not calibrated protection settings for a particular battery. Configure actual thresholds and bay maxPowerW before hardware commissioning. Backend stop margin is the upward-rounded energy at bay maximum power during sampling interval plus relay latency, adjusted for simulator speed.

## State and accounting

CREATED → READY → START_PENDING → CHARGING → STOP_PENDING → COMPLETED is the normal path. AWAITING_PLUG exists in the internal state machine; the public start endpoint rejects an unplugged bay rather than creating a held waiting session. Confirmed start rejection ends FAILED. Missing ACK/final metering results in INTERRUPTED plus reconciliationRequired and retains the credit hold. Historical PENDING/STARTING/STOPPING values remain for migration compatibility.

Start locks and reserves all available Credits, snapshots the tariff and persists the command atomically. Accrued cost uses integer ceiling arithmetic. The final debit is capped at the original hold; unused credit is released. A positive final cost produces one immutable CHARGING_DEBIT plus a RESERVATION_RELEASE event. Zero-cost failure produces the release without a zero-value debit. Receipts include energy, final cost, original reservation, unused amount, ending balance, tariff, stop reason and source. A reconciled interrupted session retains INTERRUPTED as its historical outcome, with completedAt/receipt populated and reconciliationRequired false.

The first recorded stop reason wins: BATTERY_FULL, CREDIT_EXHAUSTED, PLUG_DISCONNECTED, USER_STOPPED, ADMIN_STOPPED, EMERGENCY_STOP, DEVICE_OFFLINE, SAFETY_FAULT, MAX_ENERGY_REACHED or MAX_DURATION_REACHED. Admin reconciliation republishes STOP to obtain final metering; it never invents energy or releases an uncertain hold.

## Remaining firmware work

Implement and bench-test GPIO mapping/polarity, fail-safe boot relay-off, calibrated voltage/current/energy sensing, persistent command/session/sequence/final-meter records, canonical signing, certificate/credential provisioning and rotation, NTP synchronization, watchdog recovery, and independent emergency/thermal/electrical protection. Apply the energy and duration authorization locally even when MQTT/backend is unavailable; account for physical relay opening delay. Confirm contactor state using appropriate hardware feedback. Backend capped billing is verified, but physical cutoff, metering accuracy and electrical safety still require actual ESP32/charger validation. No firmware or hardware-folder changes are included here.
