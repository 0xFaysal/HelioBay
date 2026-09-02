# Frontend verification — 3 September 2026

Verification for the **station energy, map, branding and printable receipt refactor**, including regression coverage of the existing prepaid-credit and direct-charging journeys.

## Environment

- Existing npm / Next.js 16.3.4 / React 19 / TypeScript / Tailwind 4 / shadcn Base UI.
- Windows, Node 24, installed Microsoft Edge with Playwright.
- No dependencies added/upgraded; no formatter configured.
- Production demo server on port 3001; isolated production API-mode server on port 3002.

## Results

| Check | Result |
| --- | --- |
| ESLint | Passed; no warnings or errors |
| TypeScript / Next route types | Passed |
| Native TypeScript unit tests | **45 passed** |
| Production builds | Passed in demo mode and isolated API mode |
| Complete production demo browser suite | **19 passed**, 1 intentional API-only skip |
| Isolated production API-mode test | **1 passed** |
| Post-review energy/map/receipt regression suite | **4 passed** after resize and zoom-control polish |
| Responsive sweeps | 390, 768, 1024 and 1440px; no horizontal overflow on tested screens |
| Browser console | No application page errors in the rendering and energy journeys |
| Print | Owner top-up, charging A4/compact and Admin sheet print views verified |
| Branding / legacy UI | Active owner/Admin pages checked for exact HelioBay spelling, no global demo strip or visible hardware-model terms |
| Booking removal | No booking navigation or mandatory QR flows introduced |

The complete 19-test production suite passed again after the final map resize/zoom-control refinement, alongside the production build, lint, typecheck, 45 unit tests and the four focused browser tests. Production API-mode verification intentionally uses an absent backend, not a mocked successful live service.

## Unit coverage

Existing wallet/charging/API cases cover exact money parsing, affordable energy caps, idempotent START/settlement/top-ups, held-fund protection, all stop reasons, failures/timeouts, authorization boundaries, schema validation, cancellation, network errors and APP_MODE-only demo gating.

New energy tests cover:

- Idle solar → optional auxiliaries → battery → export.
- Charging solar-first priority, then battery above reserve, then grid deficit.
- Surplus charging/storage/export, dark idle, offline and disconnected grid.
- SOC limits over long intervals, energy conservation and no simultaneous import/export.
- Earnings from exported energy × configured tariff, never current or an invented government rate.
- Cumulative sub-poisha metering and hour/Dhaka-midnight interval splitting.
- Historical energy sums, time-weighted battery power and ending SOC.
- Freshness, future/stale controller timestamps and contextual source labels.
- Legacy persisted snapshot migration without losing credit or controller IDs.
- Policy validation and API rejection of Digital Twin energy payloads.

Receipt tests cover exact recorded balances/BDT, generic owner-facing stop reasons, provider references and the distinction between unverified payment records and posted top-up receipts.

## Browser coverage

The 15 existing credit journeys remain covered:

1. Public, owner and Admin rendering and browser-error checks.
2. Validated top-up, verification, duplicate callback and refresh persistence.
3. Pending, failed, cancelled and forged callbacks without wallet credit.
4. Bay/vehicle selection, required plug, START acknowledgement, charging and owner stop.
5. Shared Admin adjustment, mandatory reason, blocking/reactivation, exhaustion and insufficient credit.
6. Failed/timed-out START, retry, unplug and battery target completion.
7–9. Geolocation denied, unavailable and timeout with station/area search fallback.
10. Granted geolocation, nearest ordering, saved filters and unavailable-tile fallback.
11. Active routes, absence of booking controls and responsive owner/Admin sweeps.
12. Station/controller/bay uniqueness, tariff editing and rollback.
13. Vehicle CRUD/default selection, profile and notification persistence.
14. Mobile verified top-up, live session, emergency confirmation and final receipt.
15. Admin Stop, controller offline/reconnect and fault outcomes on owner receipts.

Four new journeys cover:

- Every-station monitoring; tariff/reserve validation; full storage with surplus export; historical windows, custom-range validation, CSV, reduced motion and all target widths.
- Manual pan/zoom followed by at least three telemetry revisions, availability filtering, empty results, map/list switching and explicit Fit. Viewport remains unchanged until the explicit command.
- Actual location/accuracy, nearest station distance, Enter and Space pin selection, selected-pin visibility after each viewport resize, mobile preview/directions and location cleared after reload.
- Verified top-up and charging receipts, recorded balances, owner-safe language, preserved logo and hidden dashboard chrome in A4/compact and Admin sheet print views.

The isolated API test sets APP_MODE=api with the obsolete DEMO_MODE flag true. It verifies missing backend configuration, retry, **zero seeded stations**, absent demo login and protected owner/Admin routes.

## Visual review

Screenshots inspected: mobile and desktop station map, station energy detail, branded top-up receipt, compact charging receipt and Admin print sheet. Tile-failure screenshots deliberately show the honest fallback surface; station pins, location, selection, controls and the list remain usable. Generated local station imagery was retained.

## Reproduce

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start -- --port 3001
```

In another terminal, set TEST_BASE_URL=http://localhost:3001 and run `npm run test:e2e`. API-only coverage skips against demo mode.

For isolated API verification, set HELIOBAY_TEST_API=true, NEXT_PUBLIC_APP_MODE=api, NEXT_PUBLIC_API_BASE_URL and NEXT_PUBLIC_WS_URL empty, then build and serve on port 3002. Set TEST_APP_MODE=api and TEST_BASE_URL=http://localhost:3002, then run `npx playwright test api-mode.spec.ts --output=api-test-results`. Use the separate .next-api output so the demo build is not overwritten.

## Boundaries and observations

- Real Firebase login, backend authorization/database, SSLCOMMERZ provider/IPN and physical Station Controller end-to-end operation are **not claimed as tested**. Their frontend contracts are documented in [API-CONTRACT.md](API-CONTRACT.md).
- Browser guards and local demo accounting are not production security or authoritative billing.
- History accumulates while the Digital Twin runs; no fabricated 30-day measured history is shown.
- Production needs authoritative energy meters, operator-configured tariffs, durable history, immutable receipt identity snapshots and real support contact details.
- Backend changes made separately in the shared repository were not modified or validated by this frontend milestone.
- A restricted-network API build initially could not download fonts; the approved network-enabled build passed. A simultaneous build/browser run hit Windows resource limits; the sequential full browser run passed.
- Node's existing module-type notice and Playwright's NO_COLOR/FORCE_COLOR notice are tooling warnings, not application failures.
- Screenshots, traces, .next and .next-api outputs are local and Git-ignored.
