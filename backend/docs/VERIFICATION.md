# Latest wallet/payment verification — 2026-09-03

91 tests passed across 8 files, including PostgreSQL financial concurrency and mocked SSLCOMMERZ HTTP tests. Lint, type checking, Prisma validation, migration application and production build passed. See [payment verification and manual procedure](SSLCOMMERZ-SANDBOX.md). No real Sandbox checkout was executed.

# Verification record — 2026-09-03

- Prisma CLI, client and PostgreSQL adapter: 7.10.0.
- Prisma schema validation and client generation passed.
- Initial schema and invariant migrations applied successfully to a fresh, isolated PostgreSQL 17 database. Migration status reports up to date.
- TypeScript checking, ESLint and production compilation passed.
- Vitest: **43 tests passed across 3 files**, including 10 PostgreSQL integration tests. TEST_DATABASE_URL was set; the database tests were not skipped.
- Tests cover mocked Firebase Admin verification/revocation, RBAC, blocked/disabled users, owner isolation, hierarchy/primary-controller rules, duplicate relay channels, real SQL Haversine ordering, coordinate validation, safe PATCH behavior, admin status changes, atomic audit creation, immutable audit records, money precision, negative-balance rejection, JSON errors, readiness, CORS, rate limits and sanitized internal errors.
- Demo seed executed twice: owner wallet remains 50,000 poisha (500 Demo Credits), with exactly one opening-credit ledger entry.
- Built production server smoke check: `/health/ready` returned ready; nearest search returned ST001 at 0 km and all four Dhaka demo stations within 25 km; `/api/v1/me` without a token returned 401.
- Live Firebase credentials were not supplied. SDK integration is tested through mocks; a real project/token smoke test remains an environment setup step.

Local PostgreSQL runs as Compose project `heliobay`, container `heliobay-postgres-1`, bound to localhost:5433. ParkEase PostgreSQL on 5432 and Redis on 6379 were left untouched. The temporary smoke-test API process was stopped; the development database remains running.

## Repeat the database suite

The integration tests create and remove a uniquely named schema in a dedicated database; they never reset the application schema. The test database name must end with `_test`.

```powershell
docker compose up -d
# Only needed once:
docker compose exec postgres createdb -U heliobay heliobay_test
$env:TEST_DATABASE_URL='postgresql://heliobay:local_dev_only@localhost:5433/heliobay_test'
npm test
```

Without TEST_DATABASE_URL, Vitest intentionally skips the PostgreSQL suite and runs the other tests. Do not count that as database verification.

## Implementation milestones

- `3c9ec87` — scaffold backend foundation and configuration.
- `936c436` — domain schema, migrations and demo seed.
- `5c52ce6` — Firebase verification and backend role enforcement.
- `13c5051` — owner/station/bay/device APIs and audited admin operations.
- Final test/documentation milestone follows these commits in Git history.

Each milestone was pushed to the existing `origin/main` without force-pushing. Unrelated frontend and hardware work was excluded.

## Master Prompt 3 verification — 2026-09-03

Implemented signed MQTT ingestion, a durable inbox/outbox, charging state transitions, credit limits and settlement, scoped WebSockets, admin operations and deterministic simulation.

| Check | Result |
| --- | --- |
| Prisma schema validation | Passed |
| Migration deploy on HelioBay localhost:5433 | Passed; eight migrations applied |
| TypeScript `tsc --noEmit` | Passed |
| ESLint | Passed |
| Production `tsc -p tsconfig.build.json` | Passed |
| Full tests with PostgreSQL and MQTT enabled | **132 passed, 17 files, no skips** |
| Real MQTT/REST/WebSocket charging journey | Passed against local Mosquitto on port 1884 |

The final full run used two Vitest workers and completed in 19.33 seconds. An earlier unrestricted worker run exhausted local memory; `vitest.config.ts` now caps workers at two. The passing run included all existing wallet/payment tests. No npm installation commands were executed by the agent; installed dependency CLIs were invoked with Node.

Tests cover identity/signature/source validation, stale/duplicate/out-of-order messages, durable retry after handler failure, plug/online/credit/fault prerequisites, hierarchy and concurrent start guards, command ACK/rejection/timeout, automatic stop reasons, reservation retention when physical outcome is unknown, capped nonnegative balances, immutable single final debit and unused-credit release, admin role/confirmation/reason/idempotency/audit checks, socket isolation, blocked-user disconnection and deterministic simulator cutoffs. The end-to-end test uses a real broker and isolated PostgreSQL schema, with an injected test Firebase verifier; live Firebase and physical ESP32 commissioning were not performed.

Milestones pushed to the configured origin/main:

- `b35e037` — MQTT device gateway and telemetry validation.
- `860e077` — charging state machine and device commands.
- `d102148` — reserved-credit charging limits.
- `c82e4b1` — authenticated realtime streaming.
- `04177e4` — deterministic ESP32 simulator and broker integration test.
- `bbf7b7c` — safety tests, ingestion recovery, concurrency guards and finalization coverage.
- The following documentation commit contains protocol, REST/WebSocket, environment and simulator instructions; its hash is available in Git history and the completion report.

See [firmware responsibilities](MQTT-PROTOCOL.md#remaining-firmware-work) and [simulator limitations](SIMULATOR.md). Production broker TLS/ACL provisioning, physical metering/cutoff validation and frontend adoption of these APIs remain deployment/integration work. The current realtime/IoT worker is intended for a single process. Unknown final meter state deliberately retains reserved credit pending reconciliation.
