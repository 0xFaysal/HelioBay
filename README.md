# HelioBay — Smart Solar EV Charging Network

HelioBay is a single-repository, full-stack EV charging platform. It contains a Next.js public/owner/admin frontend, an Express + PostgreSQL backend, authenticated MQTT charging control, a deterministic station simulator, prepaid Credits through SSLCOMMERZ Sandbox, persisted station-energy accounting, notifications and audit trails.

## Repository

- [`frontend/`](frontend/README.md): Next.js 16 App Router, React 19, Tailwind 4, shadcn/Base UI, Firebase Web Auth, owner and admin apps.
- [`backend/`](backend/README.md): Express 5, Prisma 7, PostgreSQL, Firebase Admin, MQTT 5, WebSocket realtime, payments and immutable accounting.
- [`hardware/`](hardware/): user-owned hardware work. Application changes do not overwrite this directory.
- [`docs/INTEGRATION-CHECKLIST.md`](docs/INTEGRATION-CHECKLIST.md): integration status and production acceptance boundaries.

## Local full stack

Use Node 22.12+ (Node 24 recommended) and Docker Desktop.

```powershell
cd backend
npm ci
Copy-Item .env.example .env
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

In a second terminal:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_APP_MODE=api`, `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`, and `NEXT_PUBLIC_WS_URL=ws://localhost:4000/api/v1/realtime`. Configure the Firebase variables from the same Firebase Web app used by the backend project. See the package READMEs for complete variables and commands.

For a browser-only demonstration, set `NEXT_PUBLIC_APP_MODE=demo`. Demo data, login, charging and payment simulation are explicit and are never a fallback for API failures.

## Implemented flows

- Public marketing, station discovery/map and station details.
- Email/password and popup-free Google redirect authentication, password reset and guarded owner/admin routes.
- Owner dashboard, direct bay charging, vehicles, wallet, payment outcomes, ledger, charging history, receipts, profile/preferences and notifications.
- Admin users, station/controller/bay/tariff CRUD, exact ledger reversal, fault acknowledgement/resolution, charging operations and energy monitoring/history.
- PostgreSQL-backed wallet reservations, integer metering, final settlement, payment validation, notifications and audit.
- Signed MQTT controller protocol with command ACK/final-meter reconciliation, WebSocket updates and a development Digital Twin.

## Production boundaries

Deployment still requires account-owned configuration: Firebase/Google authorized domains and OAuth redirect URI, Firebase Admin credentials, production PostgreSQL, an authenticated TLS MQTT broker, SSLCOMMERZ merchant credentials/callback reachability, and commissioned electrical hardware. No client code or test fixture bypasses those controls.

For the Vercel hostname shown during OAuth testing, the exact Google redirect URI is:

```text
https://heliobay.vercel.app/__/auth/handler
```

See [`frontend/docs/FIREBASE-VERCEL.md`](frontend/docs/FIREBASE-VERCEL.md) before production sign-in testing.
