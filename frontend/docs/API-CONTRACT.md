# Backend and ESP32 integration contract

The browser only connects to a trusted REST API and backend WebSocket endpoint. It does not open MQTT connections, store MQTT credentials, address an ESP32 directly, or implement physical safety protection.

```
Next.js frontend → authenticated backend API → MQTT broker → ESP32
                ← validated WebSocket events ← backend ← device telemetry / ACK
```

## Modes and authentication

`NEXT_PUBLIC_APP_MODE=demo` plus `NEXT_PUBLIC_DEMO_MODE=true` selects the local simulator. `NEXT_PUBLIC_APP_MODE=api` always selects the API adapter, even if demo identity buttons are enabled. Missing mode selects demo only when demo is explicitly enabled. A failed API request never switches adapters or creates fake financial/device success.

The API client attaches the signed-in Firebase user's ID token as `Authorization: Bearer …`. No ID token is persisted in the demo store. A 401 clears the current session; a 403 is reported as an authorization failure. Firebase custom claim `role: admin` enables the admin navigation guard, but the backend must verify the token, claim, ownership and scope on **every** operation. Demo roles and browser guards provide no production security.

For API smoke testing without Firebase, the explicit demo identity buttons can display the protected shell, but no fake auth token is generated. Backend requests must reject such a session in a real deployment. Disable demo identities for production.

## Client behavior

`lib/api/client.ts` centralizes URL handling, JSON parsing, schema validation, auth, timeout (8 seconds per attempt), cancellation and errors. GET requests retry once for network/5xx failures. Mutations are never automatically retried. Financial creation and commands carry an `Idempotency-Key`. The backend must retain and enforce these keys; client headers alone do not provide idempotency.

All successful responses must match `lib/platform/schemas.ts`. Invalid JSON, missing fields, impossible values and corrupt realtime payloads are rejected. Errors expose a typed `ApiError` with `status` and `code`. No real secrets belong in public configuration.

## REST endpoints used by this frontend

The complete interfaces are in `lib/platform/contracts.ts`; `lib/platform/api.ts` is the implementation. JSON responses below are direct objects, not a `{data: …}` envelope. Identifiers are URL-encoded.

| Endpoint | Response / behavior |
| --- | --- |
| `GET /stations` | `Station[]`; public directory |
| `GET /stations/:stationId/telemetry` | `Telemetry[]` |
| `GET /platform/snapshot` | `PlatformSnapshot {network, owners}`; only the authenticated owner's data, or authorized admin scope |
| `GET /admin/network` | `NetworkData`; optional network-only adapter entry |
| `PATCH /me` | Returns validated `OwnerData`; accepts profile, vehicles, selection, favorites and preferences only |
| `POST /payments/simulate` | `{authorizationId: string, authorized: true}`; validates simulated payment choice and reserves an authorization |
| `POST /bookings` | `Booking`; receives booking input plus authorization ID; must consume authorization and lock the bay atomically |
| `PATCH /bookings/:bookingId` | Owner cancellation returns `{refundedAmount: number}`; admin mutation returns `{success:true}` or 204 |
| `POST /charging-sessions/prepare` | `ChargingSession`; idempotently prepares a non-energized session for a paid booking |
| `POST /charging-sessions/start` | `DeviceCommand`; accepts `sessionId`, command and confirmed override; command acceptance is **not** device acknowledgement |
| `POST /charging-sessions/:sessionId/stop` | `DeviceCommand`; `STOP` or `EMERGENCY_STOP` |
| `POST /charging-sessions/:sessionId/commands` | `DeviceCommand`; e.g. pause |
| `POST /admin/devices/:deviceId/commands` | `DeviceCommand`; START, STOP, PAUSE, EMERGENCY_STOP, RESTART or TEST |
| `PUT /admin/stations/:stationId` | Validated station mutation; `{success:true}` or 204 |
| `PATCH /admin/stations/:stationId/bays/:bayId` | Enable, block, maintenance or device assignment; `{success:true}` or 204 |
| `PATCH /admin/faults/:faultId` | `{status,note}`; `{success:true}` or 204 |
| `POST /admin/maintenance` | `{deviceId,note}`; `{success:true}` or 204 |
| `PATCH /admin/refunds/:refundId` | Approval; `{success:true}` or 204 |
| `PATCH /admin/pricing` | Validated `PricingRule`; `{success:true}` or 204 |
| `POST /admin/pricing/rollback` | Restore previous policy; `{success:true}` or 204 |

Admin tables currently hydrate through the scoped snapshot endpoint. A backend may assemble that response from `/admin/devices`, `/admin/bookings`, `/admin/payments`, `/admin/refunds` and `/admin/faults`, or replace `refresh` with those independent reads. A production implementation should add paginated endpoints as the network grows. Do not return all owners to an EV Owner token.

For reservation idempotency, a payment authorization whose follow-up booking request fails must be retryable with the same key, or expire/reverse safely on the backend. Never treat the client estimate as the authoritative price. Store the accepted price, fee and discount with the booking.

## WebSocket

`NEXT_PUBLIC_WS_URL` points to a backend `wss://` endpoint (local `ws://` is acceptable for development). Credentials and query-string tokens are rejected. After transport open, the frontend sends:

```json
{"type":"authenticate","token":"<Firebase ID token or null>"}
```

The backend must authenticate this first message before subscribing the connection to any private records. Close with code `4401` on expired/invalid auth. Browser state labels transport connection separately from device online status. Reconnection uses 1/2/4/8/16-second backoff, with cleanup and explicit Retry connection after failures.

Validated event envelopes:

```json
{"type":"telemetry","data":{"deviceId":"ST001","bayId":"BAY01","online":true,"occupied":true,"charging":true,"solarVoltage":5.8,"solarCurrent":0.31,"solarPower":1.8,"carBatteryVoltage":3.91,"carBatteryPercent":66,"chargingCurrent":0.48,"chargingPower":2.4,"energyWh":1.23,"stationBatteryPercent":74,"source":"SOLAR","timestamp":"2026-09-02T08:00:00Z","simulated":false}}
```

```json
{"type":"acknowledgement","data":{"commandId":"CMD-1001","deviceId":"ST001","success":true,"state":"CHARGING","message":"Charging started","receivedAt":"2026-09-02T08:00:01Z"}}
```

Also supported: `{type:"session", data: ChargingSession}` and `{type:"invalidate", data:{resource:"stations"|"bookings"|"payments"|"faults"}}`. The latter reloads the scoped snapshot. Out-of-order telemetry is ignored; acknowledgements must match a pending command/device and issuance time. API mode rejects telemetry marked `simulated:true`.

After completing a session, publish both a session event and an invalidation for booking/payment reconciliation. Timed-out commands are marked **delivery unknown**: the UI does not claim physical output changed. A late ACK requires a fresh backend snapshot to reconcile; it cannot revive an expired command silently.

## MQTT-ready model and units

`DeviceCommand` includes `command`, `commandId`, `sessionId`, logical `stationId`, `bayId`, `deviceId`, `maximumMinutes`, `issuedAt`, `expiresAt`, actor, override and status. The backend maps the logical station ID (e.g. `green-point`) to its hardware namespace/device ID (`ST001`) before publishing MQTT. Frontend-only `outcome` is a simulator test setting and must not control production device behavior.

Prototype telemetry is in volts, amperes, watts and watt-hours. Battery percentage and remaining time are **estimated** from the sense voltage, capacity, measured current and taper. Missing or stale readings display Unavailable rather than fabricated precision.

The demo separately reports scaled EV-equivalent kWh for the existing owner billing journey: `prototype Wh × demoScalingFactor / 1000`. `demoSpeed` independently accelerates simulated time at 1×, 10× or 60×. Neither scaling factor describes physical charger performance. Do not bill real customers from this model.

## Device safety obligations

The simulator enforces paid booking, identity, station/device online, enabled unblocked bay, vehicle detection, unique active bay, and no blocking faults. A confirmed admin override bypasses only an expired reservation time, never payment or safety checks. Normal STOP waits for acknowledgement. Demo emergency stop cuts simulated output immediately and latches a fault. Vehicle removal completes safely; offline interrupts; sensor fault suppresses measured values; low storage enables simulated grid backup or pauses.

Real hardware must provide watchdogs, interlocks, overcurrent/thermal protection, authenticated commands, duplicate-command handling, metering, safe boot state and a physical emergency switch independently of the website, network and MQTT broker. This frontend is not a safety-certified control system.
