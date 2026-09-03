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
