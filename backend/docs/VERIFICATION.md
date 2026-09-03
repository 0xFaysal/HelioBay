# Backend verification — 4 September 2026

## Results

| Check | Result |
| --- | --- |
| Prisma schema validation/client generation | Passed |
| Migration deploy/status | Passed; all 11 migrations applied locally |
| TypeScript `tsc --noEmit` | Passed |
| ESLint | Passed |
| Production `tsc -p tsconfig.build.json` | Passed |
| PostgreSQL + MQTT test suite | **133 passed across 17 files** |
| Browser → REST → PostgreSQL → MQTT → simulator → WebSocket journey | Passed |

The suite uses PostgreSQL on localhost:5433 and Mosquitto on localhost:1884. Database tests create/remove isolated schemas inside a database whose name must end in `_test`; application and unrelated databases are not reset.

## Coverage

- Firebase token verification boundaries, local database role/status enforcement and owner isolation.
- Station/controller/bay hierarchy, assignment guards, tariffs, vehicle/profile preferences and public nearest search.
- Exact integer wallet accounting, holds, idempotent top-ups, payment validation, immutable ledger, exact-entry reversals and audit.
- Signed MQTT identity/source/sequence validation, durable inbox, command outbox/ACK/timeout, final metering and all safe stop outcomes.
- Authenticated scoped WebSocket rooms, reconnect recovery, blocked-user handling and notification persistence.
- Persisted solar/storage/EV/grid intervals, no simultaneous import/export, policy validation and interval tariff snapshots.
- Fault acknowledgement/resolution, required operator reasons and active-session reconciliation guards.

## Repeat

```powershell
docker compose up -d
$env:TEST_DATABASE_URL='postgresql://heliobay:local_dev_only@localhost:5433/heliobay_test'
$env:MQTT_TEST_URL='mqtt://127.0.0.1:1884'
node node_modules/prisma/build/index.js validate
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc -p tsconfig.build.json
```

The current workstation's global npm launcher is broken, so direct local-package CLI entrypoints are shown. Normal installations can use the equivalent `npm run` commands from `package.json`.

## Boundaries

No live Firebase credential, real SSLCOMMERZ checkout, production MQTT broker or physical controller was used. The full-stack browser test injects test-only Firebase verification and payment adapters into a runner that refuses non-test databases. Production requires real provider credentials, secure infrastructure and hardware commissioning; passing local tests does not certify them.

Current realtime fan-out, inbox draining and HTTP rate limiting are process-local. Add worker leadership/distributed fan-out and a shared rate-limit store before scaling the API horizontally.
