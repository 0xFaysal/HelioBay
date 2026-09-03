# API v1

Base path: `/api/v1`. JSON success: `{ "data": ..., "meta": { "page": 1, "limit": 20 }, "requestId": "..." }` (meta only on paginated lists). Error: `{ "error": { "code": "...", "message": "...", "details": [] }, "requestId": "..." }`. Every response has `X-Request-ID`. Money/energy BigInts are decimal strings. Other integers and coordinates are JSON numbers. Times are ISO UTC.

Lists use `page` (default 1) and `limit` (default 20, maximum 100). A short page indicates the end. Errors: 400 validation/JSON, 401 missing/invalid/revoked Firebase token, 403 role/account/origin, 404 missing or not-owned resource, 409 database/state conflicts, 422 business rules, 429 rate limit, 500 sanitized unexpected failure, 503 database readiness failure.

## Public

| Method | Route | Details |
|---|---|---|
| GET | `/stations` | Paginated station directory |
| GET | `/stations/nearest?lat=23.7806&lng=90.4193&radiusKm=25&limit=20` | Required latitude -90..90 and longitude -180..180; radius >0 to 200 km; ordered by computed Haversine distance; `distanceKm` included |
| GET | `/stations/:stationId` | Internal station ID from directory, not public station code |
| GET | `/stations/:stationId/bays` | Paginated bays |
| GET | `/health/live` | Outside `/api/v1`; process liveness |
| GET | `/health/ready` | Outside `/api/v1`; PostgreSQL query |

Stations include status, primaryDevice `{id, publicId, status}`, tariff, availableBays and totalBays. No credential references, MQTT identifiers, hardware metadata or other internal controller fields are public. Available bays are enabled bays whose state is AVAILABLE.

## Authenticated owner

Send `Authorization: Bearer <Firebase ID token>`. Verified UID synchronizes a local user and creates a zero-balance wallet on first login. Admin claims are ignored; role is local. Blocked and disabled users cannot access protected routes.

| Method | Route | Body / response |
|---|---|---|
| GET | `/me` | Local profile |
| PATCH | `/me` | Partial `{name, phone, city, preferences, savedStations}`; role/status/UID edits rejected |
| GET | `/me/vehicles` | Own vehicles, paginated |
| POST | `/me/vehicles` | `{name, plate, connectorType, capacityWh, estimatedSocPct?, isDefault?}` |
| PATCH | `/me/vehicles/:vehicleId` | Partial vehicle fields |
| DELETE | `/me/vehicles/:vehicleId` | Deletes an unreferenced, inactive own vehicle |
| GET | `/me/wallet` | balanceMinor, heldMinor, availableMinor; read only |
| GET | `/me/wallet/ledger` | Own ledger, newest first |
| GET | `/me/charging-sessions` | Own sessions, newest first |
| GET | `/me/payments` | Own payment records with authoritative provider state |
| GET | `/me/notifications` | Durable account/session/wallet notifications, newest first |
| PATCH | `/me/notifications/:notificationId/read` | Mark an owned notification read |
| POST | `/wallet/top-ups` | Create an idempotent SSLCOMMERZ Sandbox payment session |
| GET | `/wallet/top-ups/:transactionId` | Read an owned payment's current verified state |

Connector types: `CCS2`, `TYPE_2`, `CHADEMO`, `AC_SOCKET`. capacityWh is a positive integer up to 1,000,000. Vehicle ownership comes from the authenticated user, never a supplied ownerId.

## Admin

All `/admin` routes require an ACTIVE local ADMIN. Generic mutation bodies wrap fields in `data`; optional `reason` lives beside it. Unknown fields are rejected. POST creates; PATCH updates; DELETE requires `{ "reason": "Meaningful explanation" }`.

| Method | Route | Details |
|---|---|---|
| GET | `/admin/users?search=` | Paginated name/email search |
| GET | `/admin/users/:id` | User details |
| PATCH | `/admin/users/:id` | `{status: "ACTIVE" or "BLOCKED" or "DISABLED", reason}` (unwrapped) |
| GET | `/admin/audit-logs` | Paginated audit records |
| GET/POST | `/admin/stations` | List/create |
| GET/PATCH/DELETE | `/admin/stations/:id` | Read/update/delete |
| GET/POST | `/admin/bays` | List/create |
| GET/PATCH/DELETE | `/admin/bays/:id` | Read/update/delete |
| GET/POST | `/admin/devices` | List/register |
| GET/PATCH/DELETE | `/admin/devices/:id` | Read/update/assign/delete |
| GET/POST | `/admin/tariffs` | List/create |
| GET/PATCH/DELETE | `/admin/tariffs/:id` | Read/update/delete |
| GET | `/admin/stations/:stationId/energy` | Persisted current station flow and interval history; optional `from`/`to` |
| PUT | `/admin/stations/:stationId/energy-policy` | Capacity, SOC/power limits and grid import/export tariffs |
| GET | `/admin/charging-sessions` | Paginated owner sessions with commands, events, telemetry and receipts |
| POST | `/admin/charging-sessions/:sessionId/stop` | Audited safe stop request; idempotency key required |
| POST | `/admin/charging-sessions/:sessionId/reconcile` | Retry STOP to obtain final meter; never fabricates settlement |
| GET | `/admin/devices/:deviceId/telemetry` | Current device and bay telemetry |
| GET/POST | `/admin/devices/:deviceId/commands` | Command history; issue safe TEST/RESTART while idle |
| POST | `/admin/faults/:faultId/acknowledge` | Record operational ownership without clearing the fault |
| POST | `/admin/faults/:faultId/resolve` | Resolve after inspection and session reconciliation |
| GET | `/admin/wallet-ledger` | Paginated ledger across owners |
| GET | `/admin/payments` | Paginated payment records |
| POST | `/admin/users/:userId/wallet/adjustments` | Audited credit/debit or exact original-ledger reversal |

Station create fields: code, name, address, latitude, longitude, tariffId; optional status (ONLINE/OFFLINE/MAINTENANCE), isOpen, openingHours, solarCapable, batteryCapable. PATCH additionally accepts primaryDeviceId (nullable). Provision in order: tariff → station → device assigned to station → station primaryDeviceId → bays.

Bay create fields: code, stationId, deviceId, number, connectorType, relayChannel (1..32), maxPowerW; optional status (AVAILABLE/PLUGGED/STARTING/CHARGING/STOPPING/FAULT/OFFLINE/DISABLED), enabled. Number and relay are unique within station. The assigned device must be its primary controller. These are administrative states; no hardware command is published by this API.

Device registration fields: publicId, stationId, mqttClientId; optional firmwareVersion, credentialRef, hardwareMetadata `{model?, channels?}`. credentialRef accepts only `secret://...` references to a future secret store, never plaintext device credentials. References are not returned by device endpoints or copied into audit. No IP address is collected. Reassignment requires no bays, primary role or active sessions on the device.

Tariff fields: name, priceMinorPerKwh (positive integer, maximum 1,000,000), active. Currency is BDT. Changes do not alter snapshotted historical session tariffs.

Example station creation:

```json
{"data":{"code":"ST005","name":"New Station","address":"Dhaka","latitude":23.78,"longitude":90.41,"tariffId":"<tariff-id>","solarCapable":true},"reason":"Commissioning new site"}
```

Every successful admin mutation creates an atomic audit entry with actor, action, target, safe before/after, reason where required, timestamp and server-generated correlation ID. Failed operations do not create successful audit records. Self-deactivation is rejected; users with active charging cannot be deactivated before safe stop completion.

## Payments, charging and realtime

Prepaid wallet and Sandbox payment endpoints are documented in [SSLCOMMERZ Sandbox](SSLCOMMERZ-SANDBOX.md), including callback validation, idempotency and reconciliation. See [charging REST/WebSocket API](CHARGING-API.md) for start/stop, admin commands, fault handling, final-meter reconciliation and authenticated room subscriptions. See [MQTT protocol](MQTT-PROTOCOL.md) for device messages and [development simulator](SIMULATOR.md) for repeatable demonstrations.

The frontend intentionally joins these resources client-side. API errors remain errors; they never activate demo data. Production still needs real Firebase Admin credentials, payment merchant configuration, TLS MQTT identities and commissioned hardware.
