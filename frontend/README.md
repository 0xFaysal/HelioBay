# HelioBay — prepaid solar EV charging

The existing Next.js App Router frontend now uses a **prepaid credit wallet and direct bay charging**. Public pages, Firebase authentication, EV Owner workflows and the Station Admin console share the existing white/green design, local concept imagery, Tailwind 4 and shadcn Base UI components.

## Setup

Use Node 22.18+ or Node 24 and the existing npm lockfile:

```sh
npm ci
```

Copy `.env.example` to `.env.local`, set `NEXT_PUBLIC_APP_MODE=demo`, then:

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000). Choose **Continue in Demo Mode** on sign-in. In another tab, visit `/auth/sign-in?role=admin` and choose **Continue as Demo Admin**.

Demo authentication exists **only** when APP_MODE is exactly `demo`. Missing/invalid mode selects API. The old DEMO_MODE flag no longer enables login or changes the application mode.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local development |
| `npm run build` | Production build and route generation |
| `npm start` | Serve production build |
| `npm run lint` | ESLint and React checks |
| `npm run typecheck` | Next route types and TypeScript |
| `npm test` | Wallet, charging, energy dispatch, receipts and API-client tests |
| `npm run test:e2e` | Browser tests against a running server |

No packages were added or upgraded for this refactor. No formatter is configured. On the development workstation, the existing broken global npm shim can be bypassed with `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" run dev`.

## Walk through the product

1. Sign in as Demo Owner. Alex Morgan has one EV and **500.00 Credits** of explicitly labelled demo seed credit.
2. In Stations, choose **Use my location** in the map toolbar. Denied, unavailable and timeout results offer station/area search instead. Haversine distances use actual browser coordinates in either mode. Search never invents a location. Coordinates and accuracy remain in memory for this visit only.
3. Inspect a station, get directions, then open **Connect and Start**. Select a vehicle, station and bay number.
4. Use the explicitly labelled **Simulate plug connect** action. In API mode the Station Controller supplies this signal; the control is absent.
5. Press **Start Charging**. The service validates account, credit, controller, bay, connector, plug and concurrent-session conditions. Credit is held before START; no energy is delivered until acknowledgement.
6. View charging power, delivered energy, estimated battery/time, running cost, remaining held credit and a plain-language event timeline. Owners are not shown controller internals or source switching.
7. Stop normally, disconnect, exhaust credit, fill the battery, or inject a device/fault condition from Admin. The final receipt freezes energy/cost, gives the exact reason and posts a single charging debit.
8. In Wallet → Add Credits, try presets or enter a custom amount. Minimum is **10.00 Credits**; the configured default maximum is **5000.00**.
9. Review BDT and Credits, then continue to the Sandbox. Demo mode redirects to a clearly labelled **local gateway simulator**, not a fake SSLCOMMERZ page.
10. Try successful, pending, failed and cancelled outcomes. Success first verifies the payment. Only verification adds credit, and repeated callbacks never double-credit.
11. Open Demo Admin in another tab. Block/reactivate the owner, inspect the full ledger and post a credit adjustment or reversal with a meaningful reason. Held funds cannot be silently removed.
12. Manage stations and bays; each station has **one Station Controller**, coordinating solar, storage, a bidirectional grid connection and multiple charging bays. Try START failure/timeout, full battery, unplug, offline, faults, Admin Stop and 1×/10×/60× speed.
13. Explore searchable/exportable histories, printable receipts, vehicle CRUD/default selection, profile details and notification preferences.

## Wallet accounting

- **1 BDT = 1 Credit**, represented as integer minor units: 10.01 Credits = 1001.
- Decimal input is parsed lexically with BigInt. Money never passes through floating-point decimal arithmetic.
- Meter energy is integer **milli-Wh** (`energyMWh`): 1 kWh = 1,000,000 units. This is not megawatt-hours.
- Session cost rounds cumulative energy cost **up** once to the smallest minor unit, avoiding per-tick rounding drift.
- Maximum affordable energy rounds down. Energy is capped before applying its cost, so the credit balance cannot become negative.
- All available credit is held at START. A session's budget and tariff stay fixed; a top-up during charging does not extend its hold.
- The wallet's stored balance excludes unposted session debits. Current balance subtracts accrued active cost; available balance subtracts the full hold. Completion posts one debit and releases unused credit.
- Adjustments/reversals append reasoned ledger records and audit events; they never replace or erase earlier entries.
- Failed/pending/cancelled top-ups have no wallet credit. A browser success URL is never payment authority.

## Routes

### Public and auth

`/`, `/stations`, `/stations/[stationId]`, `/how-it-works`, `/pricing`, `/sustainability`, `/privacy`, `/terms`, `/auth/sign-in`, `/auth/sign-up`, `/auth/forgot-password`.

### EV Owner

`/dashboard`, `/wallet`, `/wallet/top-up`, `/wallet/transactions`, `/charge`, `/charging/[sessionId]`, `/history`, `/vehicles`, `/profile`, `/payment/success`, `/payment/fail`, `/payment/cancel`.

Additional demo-only gateway: `/wallet/sandbox/[paymentId]`. Result pages accept a `paymentId` query parameter and query the payment service.

### Station Admin

`/admin`, `/admin/users`, `/admin/users/[userId]`, `/admin/stations`, `/admin/stations/[stationId]`, `/admin/bays`, `/admin/devices`, `/admin/sessions`, `/admin/wallet-transactions`, `/admin/payments`, `/admin/analytics`, `/admin/faults`, `/admin/settings`.

`/partner` still redirects into the guarded Admin application.

### Removed from the active app

`/bookings`, `/bookings/[bookingId]`, `/payments`, `/payments/[paymentId]`, `/admin/bookings`, `/admin/refunds` and `/admin/maintenance` no longer have route files. Wallet transactions replace payment history; faults/audit replaces maintenance.

Reusable earlier components, legacy rules and tests remain in Git, but are not imported by active routes or selected by the current browser suite. Earlier browser storage remains untouched. This refactor uses a separate versioned credit store; old reservation advances are **not converted into Credits**.

## Environment and Firebase

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_APP_MODE` | Exactly `demo` or `api`; default API |
| `NEXT_PUBLIC_API_BASE_URL` | Backend HTTP(S) REST base path |
| `NEXT_PUBLIC_WS_URL` | Backend WebSocket URL, no query credentials |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web public configuration |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Web app identifier |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Optional public Firebase setting |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Optional public Firebase setting |
| `NEXT_PUBLIC_SITE_URL` | Canonical website origin |

Enable Email/Password and Google providers in Firebase. Authorize localhost and your deployment domain. Admin access uses the Firebase custom claim `role: "admin"`, set only by a trusted backend. The SDK initializes once, manages credentials and attaches fresh ID tokens to REST requests. Client route protection is UX, **not backend authorization**.

For `auth/popup-blocked` after Vercel hosting, follow [Google sign-in on Vercel](docs/FIREBASE-VERCEL.md). Same-tab Google recovery requires the production site as `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, Firebase domain authorization and the Google OAuth redirect URI. The frontend includes a same-origin Firebase helper proxy; existing Firebase keys remain unchanged.

Use APP_MODE=api with Firebase and both backend URLs for integration. Rebuild after changing public variables. No SSLCOMMERZ store ID/password, Firebase Admin private key, MQTT password or backend secret belongs in NEXT_PUBLIC variables. The backend creates the gateway session.

## Active architecture

| Location | Responsibility |
| --- | --- |
| `lib/credit/model.ts` | Zod schemas and typed service models |
| `lib/credit/money.ts` | Exact decimal input, integer cost/caps, trusted redirect validation |
| `lib/credit/engine.ts` | Pure deterministic commands, metering and settlement |
| `lib/credit/seed.ts` | Explicit demo fixtures; empty API initial state |
| `lib/credit/selectors.ts` | Derived wallet views, bay state and Haversine |
| `lib/credit/services.ts` | Users, wallet/payments, stations, bays, devices, charging and Admin contracts; demo/API adapters |
| `store/credit-store.ts` | Validated, hydration-safe cache and demo persistence |
| `components/credit/runtime.tsx` | One shared demo loop or authenticated backend realtime lifecycle |
| `components/credit/` | Active owner/Admin/station/payment interfaces and shared receipts |
| `lib/energy/` | Typed telemetry, pure dispatch, interval metering and history aggregation |
| `components/energy/` | Responsive energy flow, monitoring, history, charts and energy policy |
| `lib/credit/receipts.ts` | Receipt presentation models from recorded session/payment/ledger data |
| `components/shared/providers.tsx` | Firebase auth and reduced-motion provider |
| `lib/api/client.ts` | Bearer auth, error mapping, cancellation, timeout and safe GET retry |

See [the current backend contract](docs/API-CONTRACT.md) for payloads, units, gateway callbacks and authoritative safety requirements.

**Website → backend → Station Controller**. The browser never talks directly to charging hardware. Stable `deviceId`, `devices` and `relayChannel` API fields remain for compatibility but are not exposed as hardware architecture. API errors do not activate the demo adapter. Data is schema-validated before applying; account changes clear API cache. WebSocket authentication is sent in its first message. Unsupported/corrupt payloads are rejected; stale data is visibly marked. A timed-out command means delivery unknown, not “charger stopped.”

## Demo persistence and fidelity

- State key: `heliobay-credit-v3`; tab-local identity: `heliobay-credit-identity`.
- Web Locks serialize demo transactions between tabs. Storage events synchronize their views without sharing identity. Without Web Locks, use one tab.
- Deterministic, bounded ticks; maximum wall-clock catch-up is five seconds. Inactive-browser communication gaps trigger safe demo termination.
- Rolling power history retains 60 points; command history 200; operational audit 500. Ledger/session history persists until site storage is cleared.
- A station-level Digital Twin dispatches actual-scale kW. EV demand tapers above 80% and is capped by the station rating and each session’s remaining credit/capacity. The legacy `modelScale` field is retained for compatibility but is no longer used for new metering.
- No global demo strip. Contextual **Digital Twin** / **Estimated** badges appear in admin telemetry; **Live** requires fresh measured backend telemetry. Sandbox labels remain on payment flows, and explicit demo authentication remains available.
- Environmental dashboard values are illustrative, not certified emissions measurements.
- Demo data is fictional and browser-local. It is not production accounting, security or a physical safety controller.

## Station energy monitoring

Open **Admin → Stations → a station** for the dispatch diagram, current KPIs, battery state, grid exchange, active sessions and controller freshness. **Admin Overview** summarizes every station; **Analytics** also exposes station history.

- Idle: optional auxiliaries use solar first; remaining solar charges storage up to its SOC and power limit, then exports. With EV demand, solar supplies EVs first, storage covers shortfall above reserve, and grid covers the remainder.
- Battery power is **positive for charging**, negative for discharging. Grid import and export cannot both be active in a normalized interval. Unsupported surplus is explicitly curtailed; unavailable supply reduces delivery.
- Use **Energy policy** to configure capacity, reserve/max SOC, charge/discharge limits, auxiliary demand and import/export tariffs. Rates start unconfigured (zero); no government tariff is assumed. Grid tariffs do not change owner charging prices.
- Energy is integrated into integer milli-Wh. Financial estimates accumulate energy × the tariff in effect, then convert to minor units. Rate changes never recalculate old intervals.
- Last 60 samples support the **Live time window**. Hourly records are retained for 31 days (maximum 800 buckets per station). Last 24 hours, 7 days, 30 days and custom Dhaka-date ranges aggregate energy sums, time-weighted battery power and ending SOC. CSV is available under **Interval records & CSV export**.
- Demo history accumulates while the browser is running; it does not invent 30 days of past measurements. Missing real telemetry displays unavailable, not simulated success.
- Existing v3 wallet, vehicle and session data is preserved. Missing energy records are initialized lazily. Old small-scale solar inputs are migrated once; stable IDs are untouched.

## Station map and receipts

The map keeps one Leaflet instance mounted while markers and filters change. An explicit command (location, station selection or Fit stations) is the only recenter trigger. Manual pan/zoom state is tracked; resize invalidation only responds to actual container dimensions. List view, compact available-bay pins, keyboard selection, accuracy circle and a mobile preview sheet work without a paid map service. Failed tiles leave pins and the full list usable.

Charging completion, verified top-up results, wallet transaction inspection and admin session/payment inspection reuse the same HelioBay receipt. A4 and compact layouts print only the receipt, preserve the existing logo and show recorded balances, energy/rate, BDT equivalence, dates and support instructions. Top-ups show Sandbox and an optional provider reference; a merchant reference is clearly identified when no provider reference exists. No QR or booking flow was introduced.

## Verification

See [verification results](docs/VERIFICATION.md). Browser tests use the installed Microsoft Edge through Playwright; on another machine install Edge or change the channel to installed Chromium.

Set `TEST_BASE_URL` to your running dev/production server. Screenshots, traces and build output are ignored by Git. Old booking suites are retained but not active.

For isolated API failure testing, start another dev process with `HELIOBAY_TEST_API=true`, `NEXT_PUBLIC_APP_MODE=api`, empty backend URLs and port 3002. The old DEMO_MODE flag may deliberately be true to test that it cannot unlock demo login. Run `tests/e2e/api-mode.spec.ts` with `TEST_APP_MODE=api` and `TEST_BASE_URL=http://localhost:3002`. The isolated build uses `.next-api`.

## What needs real systems

- Token-verified, role/owner-scoped backend and transactional wallet/session database.
- Backend SSLCOMMERZ Sandbox session creation, signed/provider-validated notifications, amount/currency matching and idempotent credit posting.
- Authenticated MQTT bridge, durable command IDs/ACKs, calibrated telemetry, device watchdogs and physical safety interlocks.
- Real location directory/geocoding, production notification delivery, durable audit/retention and compliant invoices/policies.

The existing backend folder is preserved, not replaced by a fake server. Original generated images remain optimized under `public/images`; see [asset provenance](docs/ASSETS.md).
