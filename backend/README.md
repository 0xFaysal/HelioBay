# HelioBay backend

Node.js 22.12+ (Node 24 recommended), TypeScript, Express 5, Prisma 7 and PostgreSQL. Firebase Admin verifies ID tokens, including revocation. Local user records are authoritative for roles/status; client claims never grant admin privileges.

## Local setup

```powershell
cd backend
npm ci
Copy-Item .env.example .env
# Edit .env: Firebase project, trusted frontend origins and database URL.
docker compose up -d
npm run db:generate
npm run db:migrate
npm run dev
```

For Firebase, use Application Default Credentials/workload identity or a protected service-account file referenced by `GOOGLE_APPLICATION_CREDENTIALS`. Do not put credential contents in source control. There is no fake-token login or production demo bypass.

The Compose database is for local development only and binds to 127.0.0.1. Production uses its own PostgreSQL service, credentials and backups. Apply migrations with a migration role; the API database role should not have DDL privileges. Set `TRUST_PROXY_HOPS` to the exact trusted reverse-proxy count (default zero). Rate limiting is process-local; add a shared store before running multiple API replicas.

## Demo data

```powershell
$env:ALLOW_DEMO_SEED='true'
npm run db:seed
```

Seed is forbidden when `NODE_ENV=production`. Optional `DEMO_ADMIN_FIREBASE_UID` and `DEMO_OWNER_FIREBASE_UID` bind demo users to actual test-project Firebase users. Default placeholder UIDs cannot log in. Run only in a separate demo database. It creates an admin, owner, vehicle, 500 Demo Credits, tariff, ST001/ESP32-ST001/BAY01 and three additional Dhaka stations. Stations/controllers remain OFFLINE: seed data is not evidence of hardware connectivity. Re-running does not add more credits. Production admin provisioning is an out-of-band operator action on a verified local user; no public role-change endpoint exists.

## Verification

```powershell
npm run db:validate
npm run db:generate
npm run lint
npm run typecheck
npm test
npm run build
# Against the dedicated test database (see docs/VERIFICATION.md):
$env:TEST_DATABASE_URL='postgresql://heliobay:local_dev_only@localhost:5433/heliobay_test'
npm test
```

See [API reference](docs/API.md), [verification results](docs/VERIFICATION.md), and [.env.example](.env.example) for configuration. Prepaid wallets, audited adjustments and SSLCOMMERZ Sandbox initiation/validation/IPN are implemented. See [Sandbox setup and manual testing](docs/SSLCOMMERZ-SANDBOX.md). Signed MQTT device communication, reservation-backed charging, authenticated WebSocket events, admin controls and the development simulator are implemented. See [MQTT protocol](docs/MQTT-PROTOCOL.md), [charging REST/WebSocket API](docs/CHARGING-API.md), and [simulator setup](docs/SIMULATOR.md). The frontend snapshot adapter remains separate work. This versioned resource API does not yet satisfy the frontend's older whole-platform Snapshot transport contract.

## Units and guarantees

All money is integer poisha: 100 poisha = 1 BDT = 1 Credit. BigInt database values are decimal **strings** in JSON to avoid JavaScript precision loss. `energyMWh` means integer milli-watt-hours; 1 kWh = 1,000,000 milli-Wh, not megawatt-hours. Cost is rounded up using integer arithmetic; tariff is snapshotted per session.

Station has many devices and an optional primary controller during provisioning. Every assigned bay must use that station's primary controller for this prototype. Each station has unique bay numbers and relay channels. Active sessions prevent hardware/vehicle edits. Foreign keys preserve financial/session history; deletion of referenced resources returns 409. Change enabled/status instead where appropriate.

Admin writes and audit logs share serializable transactions. Audit summaries use a field allowlist, excluding device secrets and user profile contents. Reasons are required for deletion and account status changes; operators must never put secrets in free-text reasons. Audit/ledger immutability is enforced by migration triggers. Account deactivation with active charging returns 409 until a safe stop has been completed through future hardware orchestration.

