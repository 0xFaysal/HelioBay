# HelioBay credit-wallet backend contract

This is the active frontend contract, superseding the earlier reservation/advance-payment prototype. No operational backend, payment credentials or direct MQTT client is supplied by this frontend.

The runtime validator in [model.ts](../lib/credit/model.ts) is the exact JSON schema. The implementation surface is [services.ts](../lib/credit/services.ts). All field names below are case-sensitive.

## Transport and authorization

- REST base: `NEXT_PUBLIC_API_BASE_URL`. Backend WebSocket: `NEXT_PUBLIC_WS_URL`.
- Every authenticated request sends `Authorization: Bearer <Firebase ID token>`. Verify signature, expiry, issuer, audience, account status and role on the backend.
- Admin roles are assigned by trusted Firebase custom claims and server-side user records. Never trust a client-provided role or ownerId.
- Owners may read/mutate only their own profile, vehicles, wallet, payments and sessions. Admin access must also be explicitly authorized.
- GET has one bounded transport/5xx retry. Mutations are never automatically retried. All requests have an eight-second frontend timeout and AbortSignal cancellation.
- Mutations send `Idempotency-Key`. Persist operation results per authenticated actor and key. A repeated key with a different body must return 409, not apply another transaction.
- JSON errors are surfaced honestly for 401, 403, 409, 422, 429 and 500. 401 clears sign-in. Configure CORS only for trusted frontend origins.
- API mode never falls back to demo state. Firebase/SSLCOMMERZ/MQTT backend credentials are never sent to this client.

## Data and units

Money is always integer poisha, displayed as Credits at **100 minor units = 1 Credit = 1 BDT**. Fields ending `Minor` must never contain decimal currency numbers.

Energy is integer **milli-Wh**, using the existing `energyMWh` field:
`1 kWh = 1,000,000 milli-Wh`. This spelling is not megawatt-hours. Voltage = V, current = A, power = W, capacityWh = Wh, elapsedMs = ms. Dates are ISO 8601 UTC; UI timestamps use Asia/Dhaka.

### Coherent Snapshot response

All mutations except top-up creation return the **entire authorized Snapshot**, after the atomic transaction. GET /platform/snapshot returns the same shape.

```ts
type Snapshot = {
  revision: number;          // monotonically increasing for this authorized feed
  lastTick: string;          // authoritative server observation time
  users: User[];
  vehicles: Vehicle[];
  stations: Station[];
  bays: Bay[];
  devices: Device[];
  energy?: StationEnergy[]; // optional extension; absent means energy unavailable
  wallets: Wallet[];
  ledger: Ledger[];
  payments: Payment[];
  sessions: Session[];
  commands: Command[];
  faults: Fault[];
  audit: Audit[];
  policy: Policy;
  previousPolicy: Policy | null;
};
```

Owner snapshots contain only authorized private records, plus the public station directory. Admin snapshots may contain all operational records. The API response must include the authenticated user's profile. Never return every user's private data to an owner and rely on frontend filtering.

Key model fields:

| Model | Required fields |
| --- | --- |
| User | id, name, email, role owner/admin, status active/blocked, phone, city, savedStations[], preferences {charging,wallet,offers} |
| Wallet | userId, balanceMinor |
| Vehicle | id, ownerId, name, plate, capacityWh, battery 0..100, connector CCS2/Type 2, isDefault |
| Station | id, name, address, landmark, lat, lng, deviceId, online, priceMinor, powerKw, solarPercent, image, amenities[], openingHours; optional distanceKm |
| Bay | id, stationId, deviceId, number, relayChannel 1..32, connector, enabled, plugged, fault |
| Device | id, stationId, online, lastSeen, firmware, stationBattery, solarW, gridBackup, gridExport, outcome |
| Ledger | id, userId, kind, signed amountMinor, balanceAfterMinor, reference, reason, status posted, sandbox boolean, at |
| Payment | id, userId, amountMinor, status pending/verified/failed/cancelled, sandbox true, createdAt, requestId; optional verifiedAt, providerReference |
| Policy | maxTopupMinor, defaultTariffMinor, demoSpeed 1/10/60, modelScale, targetBattery 50..100, communicationTimeoutMs 5000..120000 |

Device `outcome` is a demo control retained for schema compatibility; return `success` in API mode. Do not use it as proof of hardware success. Policy demoSpeed/modelScale are ignored for metering in API mode. Station `image` currently accepts a stable local `/images/filename.webp` path; return a supplied asset until an approved media-origin contract is added.

A station has exactly **one controlling primary Device**, referenced by Station.deviceId. All its Bays reference that same device. Enforce unique bay number and relayChannel per station. Do not allow channel/device reassignment during active charging. Future multi-controller expansion can add controller assignment groups without changing global bay IDs.

### Sessions and commands

Session fields: id, ownerId, stationId, bayId, deviceId, vehicleId, state (pending/charging/completed), createdAt, updatedAt, optional startedAt/completedAt/stopReason, initialBattery, battery, targetBattery, energyMWh, elapsedMs, tariffMinor, startingBalanceMinor, reservedMinor, costMinor, optional endingBalanceMinor, commandId, points[], events[].

Each telemetry point is:
```json
{
  "at": "2026-09-02T12:00:00.000Z",
  "voltage": null,
  "current": null,
  "powerW": 30000,
  "energyMWh": 28000,
  "battery": 64.1,
  "source": "SOLAR",
  "simulated": false
}
```

Readings may be null when unavailable. Points carry source SOLAR/STORAGE/GRID and a simulated flag. API mode rejects simulated realtime telemetry. A real low-voltage prototype must not be labelled high-voltage EV metering; only the backend can supply calibrated/explicitly modelled energy.

Commands contain id, optional sessionId/bayId, deviceId, command START/STOP/EMERGENCY_STOP/TEST/RESTART, status pending/acknowledged/failed/timed-out, outcome (schema-compatible field), issuedAt, expiresAt, actorId, message and optional stopReason.

Stop reasons are exactly:
BATTERY_FULL, CREDIT_EXHAUSTED, PLUG_DISCONNECTED, USER_STOPPED, ADMIN_STOPPED, EMERGENCY_STOP, DEVICE_OFFLINE, FAULT.

A failed START returns a completed zero-cost session with FAULT; a START timeout uses DEVICE_OFFLINE. The command record and event timeline retain the actual failure message. A receipt alone does not prove a physical charger switched off.

## REST endpoints

All request and response bodies are JSON.

| Method and route | Request | Response |
| --- | --- | --- |
| GET /platform/snapshot | Bearer token | Scoped Snapshot |
| GET /stations | Optional lat, lng, sort=distance query | Directory object below |
| PATCH /me | name, phone, city, preferences, savedStations (partial) | Snapshot |
| PUT /vehicles/:id | Vehicle | Snapshot |
| DELETE /vehicles/:id | {} | Snapshot |
| POST /wallet/top-ups | {amountMinor, currency:"BDT"} | {paymentId, GatewayPageURL} |
| GET /wallet/payments/:id | Token-scoped ID | Payment |
| POST /charging-sessions/start | Start body below | Snapshot with pending session |
| POST /devices/:id/commands | {command, sessionId?} | Snapshot with pending command |
| PATCH /admin/users/:id | {status:"active" or "blocked", reason} | Snapshot |
| POST /admin/users/:id/wallet-adjustments | {amountMinor, reason, kind:"adjustment" or "reversal"} | Snapshot |
| PUT /admin/stations/:id | Station | Snapshot |
| PUT /admin/bays/:id | Bay | Snapshot |
| PUT /admin/stations/:id/energy-policy | EnergyPolicy | Snapshot with updated station policy |
| PATCH /admin/tariffs | Policy fields plus rollback boolean | Snapshot |
| PATCH /admin/faults/:id | {status:"acknowledged" or "resolved", note} | Snapshot |

Public directory shape:
```ts
{ stations: Station[]; bays: Bay[]; devices: Device[]; policy: Policy }
```
Return only public controller fields; no secrets. With lat/lng, compute distances on the backend and include distanceKm. The map uses actual browser coordinates with Haversine on the loaded directory, never fabricated area coordinates. Station/area search is independent of geolocation. Optional server nearest queries remain available in the service.

START body:
```json
{
  "stationId": "green-point",
  "bayId": "green-point-BAY01",
  "vehicleId": "ev-demo-owner",
  "requestId": "client-generated-uuid"
}
```
Admin may additionally provide ownerId; ignore/reject that override for owners. Resolve actual owner from the Firebase token.

There is intentionally no API endpoint for frontend plug injection, fake payment outcomes, battery-full injection or fake faults. Those controls exist only in Demo Mode.

## SSLCOMMERZ Sandbox flow

1. POST /wallet/top-ups validates integer amount, minimum 1000 minor, configured maximum, currency and active owner. Create a **pending** durable payment record with the idempotency key.
2. The backend alone calls the provider's sandbox session endpoint using server-side store credentials. It configures its success/failure/cancel/IPN callback routes.
3. Return:
```json
{
  "paymentId": "PAY-backend-reference",
  "GatewayPageURL": "https://sandbox.sslcommerz.com/gwprocess/v4/example"
}
```
4. The frontend only redirects to that returned GatewayPageURL. It rejects non-HTTPS, other hosts, ports and credential-bearing URLs. No frontend store password is required.
5. Provider callbacks/IPN hit the **backend**. Validate provider transaction status, store/payment identity, amount and BDT currency using the provider validation API. A query string supplied by the browser is never evidence.
6. In one database transaction, transition pending→verified and post **one** top-up ledger entry protected by a unique provider/payment reference. Do not overwrite historical ledger records. Duplicated callbacks must be harmless.
7. Redirect to the trusted frontend origin:
   - /payment/success?paymentId=...
   - /payment/fail?paymentId=...
   - /payment/cancel?paymentId=...
8. Every result route queries GET /wallet/payments/:id. It polls at two-second intervals for up to 15 queries; a still-pending result offers manual retry. Verified status triggers a fresh scoped Snapshot before showing spendable credit.

Do not mark a payment verified based only on reaching a success callback. Backend verification may finish after the browser returns. Cancellation/failure produces no credit. Do not let a delayed failed callback reverse a previously verified transaction without an explicit reconciled ledger reversal.

Official reference: [SSLCOMMERZ developer documentation](https://developer.sslcommerz.com/doc/v4/index.html).

## Transactional charging guarantees

START must atomically:

1. Validate active account, positive available balance, station/controller online and fresh.
2. Validate selected bay belongs to that station/controller, is enabled/fault-free/plugged and matches the vehicle connector.
3. Validate no active session for bay, owner or vehicle, and battery below limit.
4. Lock tariff and target battery, reserve available credit, create pending session and correlated command. Commit before publishing START to MQTT.
5. Return pending; only authenticated, matching firmware ACK activates the session.

The device/backend, not this browser, must enforce credit and battery limits even if the page closes or connectivity disappears. Send an enforceable energy budget/watchdog to the device.

Reference cost formula uses integer arithmetic:
`costMinor = ceil(energyMWh * tariffMinor / 1_000_000)`
`maxEnergyMWh = floor(reservedMinor * 1_000_000 / tariffMinor)`

Wallet.balanceMinor is posted balance **before unposted active debit**. UI current = posted balance − active accrued costs; available = posted balance − full active holds; remaining hold = reserved − accrued cost. Never send a balance already reduced by live cost alongside an unposted active session, or it would be counted twice.

Upon termination, freeze energy and cost, transition the session once, debit once, release the hold, record ending balance and stop reason, append events/audit and publish a newer Snapshot. Unique active-session and settlement constraints must hold under concurrent tabs/retries/operators.

Do not debit held credit through an admin adjustment. Require meaningful reason, actor, timestamp and idempotency for adjustments/reversals. Blocking a user must stop active charging safely, preserve its financial history and reject new purchases/starts.

## Backend realtime

The frontend opens one native WebSocket to the configured backend:
```json
{"type":"authenticate","token":"FIREBASE_ID_TOKEN"}
```
The server must authenticate before private messages and scope its stream to the user. Close with 4401 on expired/invalid auth.

Supported envelope:
```json
{"type":"snapshot","data":{"revision":42,"lastTick":"...","users":[],"vehicles":[],"stations":[],"bays":[],"devices":[],"wallets":[],"ledger":[],"payments":[],"sessions":[],"commands":[],"faults":[],"audit":[],"policy":{},"previousPolicy":null}}
```
The abbreviated example must be populated with schema-valid entities/policy. Revision must increase within each feed. Entire coherent snapshots avoid credit/session tearing; production pagination/delta events can replace the service implementation later.

The browser validates schema, rejects simulated hardware points in API mode, ignores older revisions and cleans up on account changes/unmount. Reconnection uses bounded backoff. Stale telemetry shows unavailable; an expired pending command offers refresh and indicates **unknown output**, never synthetic successful shutdown.

Backend MQTT credentials, topics, relay pin mappings, physical emergency stops, watchdogs, current limits and authenticated telemetry belong to the backend/firmware integration.

## Station-energy extension

Schemas in `lib/energy/model.ts` extend Snapshot with optional `energy: StationEnergy[]`. Existing snapshots without it still parse and show an honest unavailable state. Each entry contains:

- `stationId` and `policy: EnergyPolicy`.
- `current: StationTelemetry`, with timestamp, stationId, telemetrySource (`live | estimated | digital_twin`).
- Solar: voltageV, currentA, powerKw, energyTodayKwh.
- Battery: socPct, capacityKwh, availableKwh **above reserve**, signed powerKw (+ charging / − discharging), state.
- EV load: powerKw, energyTodayKwh, activeSessions.
- Grid: importPowerKw, exportPowerKw, importEnergyTodayKwh, exportEnergyTodayKwh.
- Finance: **importCostMinor / exportEarningsMinor** in integer poisha. BDT presentation divides by 100; do not send floating-point money in minor fields.
- Controller: status online/offline and lastSeenAt. Also auxiliaryKw and curtailedKw.
- `samples`: at most 60 telemetry records; `history`: at most 800 hourly EnergyBucket records.

API snapshots reject Digital Twin current, historical and sample records. Derived backend records may use estimated. Live requires source=live and both observation/controller timestamps within the configured freshness window (future timestamps are rejected for freshness). Missing source fields must not be silently replaced with zero measurements. Return no energy record if a complete trustworthy payload is unavailable.

EnergyPolicy contains capacityKwh, minSocPct, maxSocPct, maxChargeKw, maxDischargeKw, auxiliaryKw, importTariffMinor and exportTariffMinor. Reserve must be lower than max SOC. Tariffs are operator-configured integer poisha/kWh; zero means unconfigured. Policy updates use the existing authenticated/idempotent mutation client and require backend administrator authorization and audit.

EnergyBucket contains at (hour start), durationMs, solarMWh, evMWh, importMWh, exportMWh, batterySocPct (ending), batteryKwMs (power × duration), importNumerator, exportNumerator and source. Numerators accumulate integer milli-Wh × the tariff in force; monetary minor units are floor(numerator / 1,000,000). This preserves sub-poisha precision across ticks and tariff changes. Backend adapters may construct these fields from durable meters and billing records. Samples/charts use kW; energy graphs use kWh; energy is never computed by summing power without time.

Hourly buckets use UTC boundaries; daily grouping and current-day totals use Asia/Dhaka. The demo splits intervals at midnight/hour boundaries, uses bounded catch-up, and retains 31 days. History is recorded runtime, not manufactured historical activity. Future paginated history APIs can replace this adapter without rewriting the UI.

The normalized contract does not permit simultaneous grid import/export. If a future backend measures distinct phases or independently connected meters that genuinely do both, extend this contract with meter topology and explanatory UI before enabling it.

Stable Device, deviceId, relayChannel and /devices endpoint names are retained for wire compatibility. The product presents **Station Controller** and numbered bays, without hardware models, pins, topics or low-level diagnostics.

## Receipt extension

Session.startedAt is optional for backward compatibility; set it on confirmed charging start. Missing historical start times are identified rather than invented. Payment.providerReference is optional and should contain the backend-verified SSLCOMMERZ transaction reference. Without it, the merchant reference is labelled as such.

Receipts derive top-up opening/closing balances from the matching posted ledger entry, never the current wallet. Charging receipts use frozen session settlement fields. Store immutable customer/station/vehicle receipt snapshots in a production backend to retain exact historical identities after edits/deletion; current frontend records use the available entity values with ID fallbacks. Operator contact is not invented: the receipt directs the owner to the station operator until real support configuration is supplied.
