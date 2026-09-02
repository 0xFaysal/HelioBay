# HelioBay frontend

A responsive solar EV charging experience built inside the existing Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, and shadcn Base UI project. No framework reinitialization or unrelated version upgrade was performed.

## Quick start

Use the existing npm lockfile. Node 22.18+ or Node 24 is recommended for the native TypeScript unit-test command.

```sh
npm ci
```

Copy `.env.example` to `.env.local` and keep `NEXT_PUBLIC_DEMO_MODE=true` for a local walkthrough. A demo-enabled, ignored `.env.local` is supplied in this working copy.

```sh
npm run dev
```

Visit http://localhost:3000. Choose **Sign in → Continue in Demo Mode**.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production compilation and route generation |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint, including React hooks and accessibility checks |
| `npm run typecheck` | Generate Next route types and check TypeScript |
| `npm test` | Ten booking, pricing, availability, and refund rule tests |
| `npm run test:e2e` | Headless browser journeys against a running local server |

Browser tests default to Microsoft Edge, which is installed on this workstation. On other machines, change `channel` in `playwright.config.ts` to an installed Chrome channel, or remove it and install Playwright Chromium. Set `TEST_BASE_URL` to test another local port. Screenshots are saved to ignored `artifacts/`; failure traces go to ignored `test-results/`.

The Windows sandbox's npm shim can be broken on this workstation. If needed, use `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" run dev` instead. No global package-manager changes are required.

## Demo walkthrough

1. Enter Demo Mode as the EV Owner. The seeded identity is Alex Morgan, `owner@heliobay.demo`; no password is needed.
2. Find HelioBay Green Point (`ST001`), choose a future date/time, select the CCS2 vehicle, and pick a duration.
3. Continue to payment. Try promo code `HELIO10`. Select **Test failure** to see decline/retry, then **bKash**, **Nagad**, **Card**, or **Test payment** for success. All methods are simulations and collect no payment credentials.
4. The successful payment atomically creates a booking and advance transaction, reserves a bay, and opens the confirmation with a QR code.
5. Refresh: the booking, transaction, vehicle state, and preferences survive through the browser-local Zustand store.
6. Choose **Try live charging demo**, simulate arrival, start charging, pause/resume, and explore offline/fault scenarios.
7. Stop with confirmation, or type STOP for an emergency stop. The final simulated bill and any unused advance refund are recorded.
8. Make a second booking and cancel it to see the cancellation/refund policy applied. View and print receipts from Payments.
9. Add/edit/remove a vehicle, set a default, change your profile and notification preferences.
10. The separate Station Partner sign-in offers **Continue as Demo Admin** (`admin@heliobay.demo`). Its read-only landing page grants no production privileges.

Demo bookings may start early for walkthroughs. Real QR codes, bay access, timing rules, and administrator claims need backend validation. The QR payload is explicitly prefixed `HELIOBAY-DEMO`.

## Environment and Firebase

`.env.example` contains only public configuration variable names:

| Variable | Use |
| --- | --- |
| `NEXT_PUBLIC_DEMO_MODE` | Exact `true` enables explicit browser-local demo identities |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web public API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Authentication domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase Web app identifier |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Optional public project configuration |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Optional public project configuration |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin for social metadata; defaults to localhost |

Configure a Firebase Web application, enable Email/Password and Google in Authentication, and add the deployment domain (and localhost for development) to authorized domains. Restart/rebuild after changing public environment variables. Never put a service-account private key in any `NEXT_PUBLIC_` variable.

The modular Firebase client initializes once using `getApps/getApp`. The auth service implements registration, email/password login, Google popup sign-in, reset email, and logout. The provider restores Firebase state after store hydration. Owner routes redirect unauthenticated users and separate the Admin demo. Authentication calls require your Firebase project; they cannot be end-to-end verified without real configuration.

For a real release, set `NEXT_PUBLIC_DEMO_MODE=false`. This alone does **not** make the data layer production-ready: booking, charging, financial, and profile data are still browser-local simulations even after real Firebase sign-in. The UI always labels that boundary. Client guards are for navigation only; backend authorization must validate Firebase ID tokens.

## Routes

| Public | Purpose |
| --- | --- |
| `/` | Cinematic marketing site, network snapshot, features, energy flow, impact, dashboard preview |
| `/stations` | Search, map/list, availability, price, distance, connector and solar filters, sorting, favorites |
| `/stations/[stationId]` | Station telemetry preview, amenities, schedule and checkout |
| `/how-it-works` | Charging journey and expandable FAQs |
| `/pricing` | Rates, interactive estimate, cancellation/refund policy |
| `/sustainability` | Solar/storage architecture and transparent impact methodology |
| `/auth/sign-in` | Email/Google and explicit demo entry; `?role=admin` for partners |
| `/auth/sign-up` | Validated Firebase registration |
| `/auth/forgot-password` | Firebase reset-email flow |
| `/privacy`, `/terms` | Prototype-specific privacy and safety notices |
| `/partner` | Guarded Demo Admin preview |

| Protected EV Owner | Purpose |
| --- | --- |
| `/dashboard` | Vehicle battery, next booking, active session, nearby stations, metrics and activity |
| `/bookings` | Filterable reservation list |
| `/bookings/[bookingId]` | Confirmation, QR pass, cancellation/refund and charging entry |
| `/charging/[sessionId]` | Live simulated telemetry and charging controls |
| `/vehicles` | Vehicle CRUD and default selection |
| `/history` | Searchable/filterable sessions |
| `/payments` | Payments, refunds, search, CSV export |
| `/payments/[paymentId]` | Print-friendly receipt |
| `/profile` | Personal details, preferences, password reset, logout |

Unknown station routes return the not-found page. Unknown private record IDs render account-scoped empty states.

## Architecture

- `types/`: explicit account, station, booking, vehicle, payment, session and owner-data models.
- `lib/firebase/`: singleton Firebase Web initialization and environment checks.
- `lib/services/`: auth, stations, pure booking rules, booking transactions, charging state machine, payments, and account mutations.
- `lib/demo/`: five Dhaka-area concept stations and relative-date seed data.
- `store/`: versioned Zustand persistence, per-account records, deliberate hydration boundary. Components never call localStorage.
- `hooks/`: hydration-safe clock subscription.
- `components/shared/`: theme, brand, imagery fallback, motion wrappers, auth provider and public shell.
- `components/owner/`, `components/stations/`, `components/charging/`: product feature surfaces.
- `components/ui/`: existing and added shadcn Base UI primitives.

Booking validation rejects unavailable/offline stations, past or over-30-day slots, invalid durations, full batteries, incompatible connectors, overlapping vehicle bookings, and occupied bays. Reservations use an idempotent request reference and update the booking and payment together. Cancellation and settlement are idempotent at the service boundary.

The charging service enforces waiting → car detected → starting → charging, with pause/resume, completion, offline, and fault transitions. Telemetry integrates power over elapsed time, caps at battery capacity and booked duration, and catches up when a live session is reopened. Session completion settles against the advance. This is a frontend simulator, **not** a device-control or safety system.

Leaflet is dynamically imported with SSR disabled. Map markers and cards share selection, mobile map selection opens a sheet, geolocation is explicitly requested with error handling, and the station list remains usable if map tiles fail.

Motion respects reduced-motion preferences. Images are local optimized WebP files rendered through next/image. Heavy chart and map code is lazy-loaded. Public route content is server-rendered; interaction and persisted account state sit behind focused client boundaries.

## Packages

Added runtime packages: `motion`, `firebase`, `react-hook-form`, `zod`, `@hookform/resolvers`, `date-fns`, `leaflet`, `sonner`.

Added development packages: `@types/leaflet`, `@playwright/test`, `tsx`. Unit tests use Node's native TypeScript support on this workstation; tsx remains available for other tooling.

Reused existing Lucide, Zustand, Recharts, React Leaflet, React QR Code, React DayPicker, Tailwind and shadcn Base UI. No overlapping UI framework was added. No formatter was configured in the original project.

## Verification

- Production build, TypeScript and ESLint pass.
- Ten rule tests cover estimates, discounts, invalid dates, duration limits, connectors, overlap, bay exhaustion and refund boundaries.
- Six end-to-end suites cover checkout failure/retry, confirmation persistence, charging controls and emergency confirmation, cancellation, receipts, vehicle CRUD/defaults, profile persistence, filters, maps, denied geolocation, failed map tiles, route guards and Admin demo.
- Responsive checks cover 390, 768, 1024 and 1440px, with desktop/mobile screenshots and horizontal-overflow assertions.
- The complete browser suite also passes against the production server. The responsive sweep checks console errors and uncaught application errors. Real Firebase/provider integrations require your project configuration.

## Assets and environmental claims

See [docs/ASSETS.md](docs/ASSETS.md). Original image-generation prompts and PNGs are preserved outside the frontend; optimized assets live in `public/images/`. No Tesla branding, fake testimonials, or broken remote image dependencies are used.

All station and impact figures are demo data. The illustrative CO₂ calculation is solar-delivered kWh × 0.4 kg, not a certified environmental claim.

## Remaining real-backend work

- Authenticated API/database, Firebase token verification, server-enforced ownership/admin roles and durable profile storage.
- Transactional station availability and reservation locking across users/devices, server-side time and conflict checks.
- bKash/Nagad/card provider integrations, verified webhooks, real settlement, refund processing, tax invoices and payment compliance.
- Charger/ESP32 telemetry transport, authenticated commands, acknowledgements, metering, reconnect logic and physical safety interlocks.
- Signed/expiring QR passes with server/device verification.
- Real notification delivery, monitoring, audited impact data, operational support and reviewed production policies.

The existing backend folder was intentionally not modified into a pretend working API.
