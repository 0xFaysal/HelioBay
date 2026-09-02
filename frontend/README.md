# HelioBay — frontend

Public website, EV Owner application, and Station Admin operations console inside the existing Next.js 16 App Router / React 19 / TypeScript / Tailwind CSS 4 / shadcn Base UI project. The existing design system, image assets, and npm lockfile are preserved.

## Run locally

Use Node 22.18+ or Node 24 (native TypeScript tests require a recent Node version).

```sh
npm ci
```

Copy `.env.example` to `.env.local`, keeping these settings for a credential-free walkthrough:

```dotenv
NEXT_PUBLIC_APP_MODE=demo
NEXT_PUBLIC_DEMO_MODE=true
NEXT_PUBLIC_API_BASE_URL=
NEXT_PUBLIC_WS_URL=
```

```sh
npm run dev
```

Open http://localhost:3000. Choose **Sign in → Continue in Demo Mode** for Alex Morgan, or **Station Partner / Admin → Continue as Demo Admin** for the operator. Demo identities are explicitly local simulations, not a security mechanism.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production compilation and route generation |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint and React checks |
| `npm run typecheck` | Generate Next route types; check TypeScript |
| `npm test` | Booking rules, deterministic engine and API-client tests |
| `npm run test:e2e` | Browser journeys against a running server |

No formatter was configured in the original repository. No dependencies were added or upgraded for the Admin/IoT-ready extension.

On this Windows workstation, a broken global npm shim can be bypassed with `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" run dev`. No global configuration change is necessary.

## Complete shared-demo walkthrough

1. Enter the EV Owner demo. Existing sample vehicle, bookings, sessions, payments and refunds are seeded.
2. Find **HelioBay Green Point**, device **ST001**, bay **BAY01**. Search, filter, save stations, switch map/list, and try location permission handling.
3. Choose a future slot and compatible vehicle. Use `HELIO10`, try payment failure/retry, then choose bKash, Nagad, Card or Test payment. No credentials or real money are collected.
4. Payment and reservation are recorded together with an idempotent request reference. Confirmation shows a demo QR pass; refresh preserves it.
5. Open the live charging demo, simulate car arrival, and send START. Pending → acknowledged activates the simulated output. Energy, estimated battery, elapsed time, bill and chart update.
6. Open a **separate tab** at `/auth/sign-in?role=admin` and enter Demo Admin. The owner remains signed in in its own tab.
7. In Admin Devices, inspect ST001. Try failed/timeout acknowledgements, vehicle removal, offline/reconnect, sensor faults, battery/solar inputs, grid backup and idle grid export. Resolve blocking faults with a note in Maintenance before resuming.
8. In Settings set Demo Speed to 10× or 60×. New sessions use the configured charge limit, pricing, peak multiplier and promotion.
9. Normal STOP waits for acknowledgement. Emergency stop immediately disables demo output and latches a critical fault. Vehicle removal, charge limit and reserved-duration expiry also stop charging. Final energy/bill freeze; exactly one settlement and eligible refund are recorded.
10. Disable or block a bay, edit a station, approve/reassign/cancel a reservation, approve a pending refund, export a filtered table or print a receipt. The owner view updates from the same store.
11. Review dated analytics, telemetry timelines, fault notes and the audit trail. Pricing supports reset, discard and one-level rollback; existing reservations retain their booked rates.
12. Owner vehicle CRUD/default selection, profile, notification preferences, booking/history search, cancellation and printable payment receipts remain available.

Demo reservations may start early for walkthroughs. An expired reservation needs a confirmed Admin time override; this never bypasses payment, vehicle presence, bay or fault checks. QR passes are marked `HELIOBAY-DEMO` and cannot unlock real equipment.

### Persistence and simulator limits

- Versioned Zustand local persistence shares network and owner records. Demo identity is **tab-local session storage**, so simultaneous owner/admin windows do not sign each other out.
- A single root runtime schedules updates. Same-origin Web Locks serialize commands, transactions and ticks across tabs; storage events synchronize views. Without Web Locks the fallback is suitable for a single tab, not transactional multi-tab use.
- The engine is a pure function of snapshot and supplied clock. Wall-clock catch-up is capped at five seconds per tick; closing the app does not simulate unattended hardware charging.
- Device and session timelines retain 60 points; commands and acknowledgements retain 200; audit entries retain 500; network meter history retains 240 ticks. Cumulative meter totals survive history trimming.
- Older demo reservations/payments are retained. Legacy unfinished sessions require a new vehicle/device handshake after migration.
- Prototype readings are approximately 3.0–4.2 V and up to 0.48 A, with configured taper. Prototype Wh and EV-equivalent kWh are distinct: `Wh × model scale ÷ 1000`. Demo time acceleration is a separate factor.
- Remaining time is an estimate from capacity, state of charge, voltage, current and taper; missing/stale readings show unavailable. Battery sense is not certified BMS data.
- Solar contribution is energy-weighted. Analytics separate scaled EV delivery from retained prototype solar-generation/grid/export counters. Non-solar delivery is not claimed to be certified grid metering.
- This browser simulation is not a physical safety controller or a production database.

## Modes and Firebase configuration

| Variable | Meaning |
| --- | --- |
| `NEXT_PUBLIC_APP_MODE` | `demo` or `api`; explicit `api` never falls back to seeded success |
| `NEXT_PUBLIC_DEMO_MODE` | Exact `true` permits explicit demo sign-in |
| `NEXT_PUBLIC_API_BASE_URL` | Backend REST origin/base path in API mode |
| `NEXT_PUBLIC_WS_URL` | Backend WebSocket endpoint, not an ESP32 or MQTT address |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web public API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Authentication domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase Web app identifier |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Optional Firebase public configuration |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Optional Firebase public configuration |
| `NEXT_PUBLIC_SITE_URL` | Canonical site origin; defaults to localhost |

For legacy demo setup, omitted APP_MODE plus DEMO_MODE=true selects demo. Missing/invalid mode without explicit demo permission selects API. Demo mode requires explicit permission; API failure never switches adapters.

Enable Firebase Email/Password and Google sign-in; authorize localhost and your deployment domain. The Firebase client initializes once, supports signup/login/reset/logout, and obtains ID tokens for the API. Production Admin access uses a Firebase custom claim `role: "admin"`, set only by a trusted backend. Client route guards are UX boundaries; backend authorization is mandatory.

For API mode, set APP_MODE=api and normally DEMO_MODE=false, then configure Firebase and the backend URLs. Restart/rebuild after changing public variables. Do not put private keys, provider secrets, MQTT passwords or service-account files in NEXT_PUBLIC variables. Ignored local environment files are not committed.

## Architecture and backend handoff

**Website → Backend API → MQTT broker → ESP32.** No direct browser-to-ESP32 connection, MQTT client, or embedded MQTT credentials are implemented.

| Location | Responsibility |
| --- | --- |
| `types/` | Station, Bay, Device, Booking, Session, Telemetry, Command/ACK, Payment, Refund, Fault, Maintenance, Audit and Pricing models |
| `lib/platform/contracts.ts` | Replaceable station, booking, payment, charging, device, telemetry, Admin and realtime service contracts |
| `lib/platform/demo*.ts` | Validated demo operations and atomic shared-state mutations |
| `lib/demo/engine.ts` | Deterministic charging/command/safety/settlement engine |
| `lib/platform/api.ts` | REST adapter; no mock success path |
| `lib/platform/schemas.ts` | Zod validation of external snapshots, entities and realtime envelopes |
| `lib/api/client.ts` | JSON errors, 8-second timeout, AbortSignal, Firebase bearer token, 401 handling, one safe GET retry |
| `lib/realtime/client.ts` | Configurable WebSocket abstraction with bounded backoff, cleanup and validated messages |
| `components/shared/platform-runtime.tsx` | Shared demo loop or API/realtime lifecycle, never both |
| `store/` | Hydration-safe shared cache and local demo persistence |
| `lib/services/` | Existing owner-facing service facades and booking rules |
| `components/admin/` | Role-guarded operational workflows, accessible dialogs, mobile tables/cards |
| `docs/API-CONTRACT.md` | Exact REST payloads, response shapes, event examples, units and server responsibilities |

Read [the API contract](docs/API-CONTRACT.md) before implementing the backend. The adapter uses a token-scoped `GET /platform/snapshot` for coherent owner/Admin state plus `/stations`, `/bookings`, `/payments/simulate`, `/charging-sessions/*`, `/admin/devices/:id/commands`, `/admin/faults/*`, `/admin/pricing` and other documented operations. There is no operational server hidden behind these interfaces.

WebSocket connects to the **backend**. Authentication is sent in the first message, never query-string credentials. Telemetry, acknowledgements, session updates and invalidation events are validated. Old telemetry/session updates are ignored. Pending commands time out as delivery-unknown; API mode does not pretend that an unreachable charger turned off. Browser controls never replace a physical emergency switch/watchdog.

## Routes

### Public and authentication

`/`, `/stations`, `/stations/[stationId]`, `/how-it-works`, `/pricing`, `/sustainability`, `/auth/sign-in`, `/auth/sign-up`, `/auth/forgot-password`, `/privacy`, `/terms`.

`/partner` redirects to the guarded Admin application. Unknown stations show an unavailable/not-found state; unknown private IDs show account-scoped empty states.

### EV Owner

`/dashboard`, `/bookings`, `/bookings/[bookingId]`, `/charging/[sessionId]`, `/vehicles`, `/history`, `/payments`, `/payments/[paymentId]`, `/profile`.

### Station Admin

| Route | Features |
| --- | --- |
| `/admin` | Network KPIs, map, energy flow, charts, live sessions, arrivals and alerts |
| `/admin/stations` | Add/edit/search/filter/sort stations, details drawer and availability |
| `/admin/stations/[stationId]` | Full station details and bay management |
| `/admin/bays` | Enable/block/maintenance and device assignment |
| `/admin/devices` | Telemetry, command/ACK lifecycle and demo test panel |
| `/admin/bookings` | Approval, cancellation, refund estimate and bay reassignment |
| `/admin/sessions` | Active/completed sessions, stop control and telemetry timeline |
| `/admin/payments` | Transactions, details, CSV and printable receipt |
| `/admin/refunds` | Pending/completed refunds and simulated approval |
| `/admin/analytics` | Date range, accessible charts/data tables, energy/revenue/impact and CSV |
| `/admin/maintenance` | Fault triage, acknowledgement/resolution notes, maintenance and audit |
| `/admin/settings` | Validated pricing, rollback, demo speed and connection configuration |

## Verification

See [the verification report](docs/VERIFICATION.md) for the latest results and environment notes.

Automated checks include 29 unit tests covering booking/refund boundaries, duplicate-bay prevention, START prerequisites, pending/success/failure/timeout ACKs, deterministic telemetry, settlement idempotency, automatic completion, vehicle/offline/fault safety, bounded history, legacy migration, API abort/timeout/auth/schema errors and explicit mode selection.

The demo browser suites cover the complete owner journey plus cross-tab Admin operations, station CRUD, table export/pagination/sorting, approval/reassignment/cancellation, pricing rollback, refund approval, command failures, mobile navigation and role separation. Responsive sweeps cover 390, 768, 1024 and 1440px; Admin routes are checked at 390 and 1440px with console/runtime and overflow assertions.

Browser tests use installed Microsoft Edge. On other machines, change `channel` in `playwright.config.ts` or remove it and install Playwright Chromium. Set TEST_BASE_URL to a running server (for example http://localhost:3001 for a production server on port 3001). Screenshots and failure traces are ignored by Git.

The separate API failure smoke test runs only when TEST_APP_MODE=api. Start a second dev process on port 3002 with HELIOBAY_TEST_API=true, NEXT_PUBLIC_APP_MODE=api and empty backend URLs. This uses ignored `.next-api` output; DEMO_MODE=true can be retained for a test-only local identity without enabling fake API data. Run the API spec with TEST_BASE_URL=http://localhost:3002 and TEST_APP_MODE=api:

```sh
npx playwright test tests/e2e/api-mode.spec.ts
```

Real Firebase, payment-provider and hardware end-to-end checks require configured services. Restricted test networks may block OpenStreetMap tiles; the visible fallback preserves station markers/list controls and is tested.

## Images and packages

Original generated concept images are retained; optimized local WebP assets use next/image with fallbacks. See [asset provenance](docs/ASSETS.md). No additional imagery was needed for the Admin extension.

Prompt 1 added Motion, Firebase, React Hook Form, Zod/resolvers, date-fns, Leaflet, Sonner, Leaflet types and Playwright/tsx tooling, while reusing existing Lucide, Zustand, Recharts, React Leaflet and React QR Code. Prompt 2 adds no dependencies or overlapping UI framework.

Reduced-motion preferences, keyboard focus, accessible Base UI dialogs/sheets, responsive tables and lazy chart/map imports are preserved. Environmental values are demonstrative: solar-delivered kWh × 0.4 kg CO₂ is an illustrative estimate, not a certified claim.

## Work that requires real systems

- Authenticated API/database with Firebase token verification, scoped ownership/Admin roles, server time and transactional reservation locks.
- Durable command queue, authenticated backend MQTT transport, firmware ACK correlation, independent device watchdog and physical safety interlocks.
- Calibrated INA3221/battery-sense telemetry, signed/expiring QR passes, real charging limits and certified metering where required.
- bKash/Nagad/card gateways, verified webhooks, settlement/refund processing and compliant tax invoices.
- Durable operational audit/history, real notifications, monitoring, retention policy and reviewed production terms.

The existing backend folder remains unchanged. This deliverable is a functional frontend/demo and a documented integration boundary—not a production MQTT or payment implementation.
