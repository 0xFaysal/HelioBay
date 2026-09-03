# Charging REST and realtime API

REST responses use `{data,requestId}` and optional pagination metadata. Big integers are decimal strings. Firebase Bearer authentication, active local-account status, CORS and rate limits apply. Use database IDs in route paths and WebSocket rooms. Start additionally accepts station/bay codes. An `Idempotency-Key` is 8–100 ASCII letters, digits, colon, underscore or hyphen. Reuse it only for the same logical request; changed payloads conflict.

## Owner endpoints

| Method and path under `/api/v1` | Body / result |
| --- | --- |
| POST `/charging-sessions/start` | `{stationId:"ST001",bayId:"BAY01",vehicleId:"..."}`; 202 with START_PENDING session |
| GET `/charging-sessions/:sessionId` | Own session, reservation and up to 100 state events; final receipt when available |
| POST `/charging-sessions/:sessionId/stop` | No body required; idempotency key required; 202 pending confirmed stop |
| GET `/me/wallet` | Existing wallet endpoint exposes reserved and available Credits |

Start rejects missing credit, plug, fresh device/bay telemetry, matching connector, active tariff, provisioned secret, available bay or unresolved faults. Conflicting/unreconciled owner, vehicle and bay sessions are blocked. A disconnected gateway returns 503. Successful POST means the command was persisted, not that the relay has switched. START_ACK transitions to CHARGING; final relay-off telemetry settles billing.

## Admin operations

All endpoints require the local ADMIN role. Command/configuration mutations below require an idempotency key and `{confirmed:true,reason:"at least eight characters"}`. The frontend should show its confirmation before sending `confirmed:true`; this backend does not implement frontend screens. Mutations and audit records share a transaction.

| Method and path under `/api/v1/admin` | Additional body / result |
| --- | --- |
| GET `/devices`, `/devices/:id` | Paginated devices/details, heartbeat status and data source; no secrets |
| PATCH `/devices/:deviceId/assignment` | `stationId` (database ID); requires unassigned primary/bays and no active sessions |
| PATCH `/devices/:deviceId/thresholds` | `thresholds` object; unavailable during active charging |
| PATCH `/bays/:bayId/relay` | `relayChannel` and optional `thresholds`; active relays cannot be remapped |
| GET `/devices/:deviceId/telemetry` | Latest device and per-bay snapshots, last-seen timestamps and data source |
| GET `/devices/:deviceId/commands` | Paginated persisted command history, ACK/timeout states and attempts |
| POST `/devices/:deviceId/commands` | `type:"TEST"` or `"RESTART"`; only online idle devices; TEST never pulses a relay |
| POST `/charging-sessions/start` | `userId`, `data:{stationId,bayId,vehicleId}`; uses that owner's normal credit/safety checks |
| POST `/charging-sessions/:sessionId/stop` | Admin stop with audited operator reason |
| GET `/charging-sessions` | Paginated incomplete sessions and reservations |
| GET `/charging-sessions/:sessionId/reconciliation` | Session, reservation, latest 50 commands and 100 events |
| POST `/charging-sessions/:sessionId/reconcile` | Retries STOP under a new key to obtain signed final telemetry; never manually fabricates a debit |
| GET `/faults` | Paginated faults and resolution status |
| POST `/faults/:faultId/acknowledge` | Audited acknowledgement; keeps the physical fault active |
| POST `/faults/:faultId/resolve` | Audited resolution; active charging must first be reconciled |
| GET `/stations/:stationId/energy` | Current normalized solar/storage/EV/grid flow and persisted hourly history |
| PUT `/stations/:stationId/energy-policy` | Station battery limits and grid tariffs; past intervals retain old tariffs |
| GET `/audit-logs` | Existing paginated audit trail |

Existing station/device/bay resource creation and configuration APIs remain available; use them to create inventory and set primary-controller assignment. Foreign keys and active-session guards protect existing assignments. Operator resolution records an acknowledgement of repair; confirm the physical condition is repaired before resolving. Continuing faulty telemetry raises the fault again. Unknown physical state must be inspected before any restart or reassignment.

## WebSocket connection

Connect to `wss://<api-host>/api/v1/realtime` (local development may use `ws://localhost:4000/api/v1/realtime`). Do not put tokens in the URL or connect browsers to MQTT. Send within five seconds:

```json
{"type":"authenticate","token":"FIREBASE_ID_TOKEN"}
```

The server responds with `authenticated`, local `userId` and `expiresAt`. The user's own room is automatic. Refresh the Firebase token and reconnect before expiry; authentication is not replaceable on an existing socket. Revocation is rechecked at most every 30 seconds, local status/role before delivery, and token expiry before every protected operation. Inactive users are disconnected. Origin allow-list, 60 client messages/minute, 32 rooms, payload/queue/backpressure limits and ping/pong apply.

```json
{"type":"subscribe","room":"session:DATABASE_SESSION_ID"}
```

```json
{"type":"subscribe","room":"station:DATABASE_STATION_ID"}
```

```json
{"type":"subscribe","room":"admin"}
```

Use `{"type":"unsubscribe","room":"..."}` to leave. Clients receive `subscribed`, `unsubscribed`, or `error` with a code. Owners may subscribe only to their own sessions and public station availability. Admins may subscribe to operational views. User rooms cannot be chosen on another user's behalf.

Event envelope: `{type,data,eventId,at}`. `at` is UTC; integer money/energy values are strings. Events are best-effort process-local notifications, not a durable client event log. After reconnect, fetch REST state/receipt to recover missed updates. Consumers should tolerate duplicates, including repeated final-meter reports, and use event/session IDs for rendering.

| Event | Payload and visibility |
| --- | --- |
| `station.status` | stationId, deviceId, online, dataSource; public station room and admins |
| `bay.status` | stationId, bayId code, plugConnected, relayOn, dataSource; public station room and admins |
| `plug.connected`, `plug.disconnected` | stationId, bayId code, dataSource; plug-state changes |
| `command.pending` | Session snapshot; owner/admin |
| `command.acknowledged`, `command.failed` | commandId and session snapshot; maintenance commands contain deviceId instead |
| `command.timed_out` | commandId and session snapshot; owner/admin |
| `session.telemetry` | `{session,telemetry}`; owner/admin only |
| `credit.warning` | sessionId, remainingMinor; owner/admin |
| `session.stopped` | `{session,telemetry}` on final reading, or session snapshot on confirmed start rejection |
| `fault.raised`, `fault.acknowledged`, `fault.resolved` | Operational fault identifiers/details; admins |

Session snapshots contain status, cost, energy, limits, dataSource, reconciliationRequired and receipt fields. Public station events never include owners, wallet balances or private session telemetry. Both CHARGING and pending/stopped states should be rendered from backend state; browser timers are not billing authority.
