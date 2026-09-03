# Full-stack integration work log

## Baseline (2026-09-03)

- Root monorepo: `frontend` Next.js App Router, `backend` Express/Prisma.
- Preserve untracked `hardware/`; no dependency reinitialization.
- Frontend unit tests: 61 passed. Backend: 133 passed across 17 files with PostgreSQL and MQTT enabled.
- PostgreSQL (5433) and MQTT (1884) healthy; all eleven migrations applied.
- Broken boundary: frontend `/platform/snapshot` does not exist; backend uses resource endpoints and envelopes. Realtime contracts differ.
- Identity mismatch: frontend Firebase UID/custom-claim roles versus backend database IDs/roles.

## Checklist

- [x] Typed resource adapters, structured errors and backend account identity.
- [x] Profile/preferences, vehicle CRUD, public stations and reported bay status.
- [x] Authoritative wallet, complete payment states and confirmed receipts.
- [x] Charging start/ACK/stop/final-meter projection with realtime reconnection.
- [x] Admin station/controller/bay/tariff CRUD resource forms, adjustments and audit.
- [x] Persisted energy policy/history and simulator dispatch.
- [x] In-app notifications and account security states.
- [x] Full-stack browser journey: isolated test auth, PostgreSQL, MQTT and payment settlement.
- [x] Lint, types, tests, builds, migrations and documentation.
- [x] Verified milestone commits and origin pushes.

## External acceptance requirements

Production Google OAuth needs console access and authorized redirect URI `https://heliobay.vercel.app/__/auth/handler`. Real SSLCOMMERZ Sandbox checkout needs merchant credentials and reachable callbacks. Physical charging needs commissioned, authenticated hardware. Test adapters must never become production authentication/payment bypasses.
