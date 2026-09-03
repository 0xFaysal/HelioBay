# Frontend and full-stack verification — 4 September 2026

## Current results

| Check | Result |
| --- | --- |
| Frontend ESLint | Passed; no errors or warnings |
| Frontend TypeScript / Next route types | Passed |
| Frontend native unit tests | **61 passed** |
| Backend ESLint / TypeScript | Passed |
| Backend PostgreSQL + MQTT suite | **133 passed across 17 files** |
| Isolated full-stack browser journey | **1 passed** |
| Production demo browser suite | **19 passed**, 6 intentional environment-specific skips |
| Production frontend build | Passed |
| Backend production build | Passed |
| Prisma schema / migration status | Passed; all migrations applied locally |

No formatter is configured. Node's module-type and Playwright's NO_COLOR/FORCE_COLOR messages are tooling notices, not application failures.

## Full-stack journey

`tests/e2e/full-stack.spec.ts` runs through the actual frontend resource adapter and real backend services with a dedicated `_test` database and local MQTT broker:

1. Browser email sign-in fixture exchanges a Firebase-shaped token; backend authentication maps it to the local database user and role.
2. Owner sees controller plug state, starts charging, waits for MQTT START acknowledgement and consumes persisted telemetry.
3. Simulator final telemetry settles the reservation once, posts the charging debit and creates a durable completion notification.
4. Owner creates a top-up, leaves for the SSLCOMMERZ test adapter, backend validates/settles it and the result page reads the verified payment and updated wallet.
5. Admin signs in with a separate account and reads persisted station solar/storage/EV/grid energy.

The Firebase REST endpoint and external SSLCOMMERZ checkout are fixture boundaries. Test tokens are accepted only by `backend/tests/fullstack-server.ts`, which refuses to start unless `NODE_ENV=test`, `FULL_STACK_TEST=true`, and the database URL contains `_test`.

## Reproduce

```powershell
# backend
$env:TEST_DATABASE_URL='postgresql://heliobay:local_dev_only@localhost:5433/heliobay_test'
$env:MQTT_TEST_URL='mqtt://127.0.0.1:1884'
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc -p tsconfig.build.json

# frontend
node node_modules/eslint/bin/eslint.js .
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit
node --experimental-strip-types --test tests/credit-engine.test.ts tests/api-client.test.ts tests/energy.test.ts tests/receipts.test.ts tests/google-auth.test.ts tests/resource-api.test.ts
node node_modules/next/dist/bin/next build
```

For the full-stack browser test, first bundle the test-only backend runner as documented in the frontend README, then set `TEST_FULL_STACK=true` and run the Playwright spec. `playwright.config.ts` starts the backend on 4008 and frontend on 3008 unless `TEST_SERVERS_MANAGED=true` is set for externally managed test processes.

## Production acceptance not certified locally

- Real Google account return on `https://heliobay.vercel.app` requires the account owner to authorize the domain in Firebase and the exact `https://heliobay.vercel.app/__/auth/handler` redirect in the Google OAuth client.
- Real SSLCOMMERZ Sandbox credentials/callback delivery and provider-side refunds require merchant access.
- Physical cutoff, meter calibration, contactor feedback and electrical safety require commissioned hardware and bench/site tests.
- Production scaling requires shared HTTP rate limiting, distributed realtime fan-out/worker leadership, database operations/backups and observability.

Passing fixture tests never claims those external systems are configured.
