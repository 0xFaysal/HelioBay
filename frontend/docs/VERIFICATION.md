# Frontend verification — 3 September 2026

Verification for the **prepaid-credit / direct bay charging refactor**. Earlier booking suites remain recoverable but are no longer selected by the current test scripts.

## Environment

- Existing npm / Next.js 16.3.4 / React 19 / TypeScript / Tailwind 4 / shadcn Base UI.
- Windows, Node 24, installed Microsoft Edge with Playwright.
- No dependencies added/upgraded; no formatter configured.
- Production demo server tested on port 3001. Isolated API-mode dev server tested on port 3002.

## Results

| Check | Result |
| --- | --- |
| ESLint | Passed; no warnings or errors |
| TypeScript / generated Next route types | Passed |
| Native TypeScript unit tests | **30 passed** |
| Production build | Passed; updated public, owner and 13 Admin page routes generated |
| Complete production demo browser suite | **15 passed** |
| Isolated API-mode test | **1 passed** |
| Final production smoke after startup-race fix | **2 passed** (rendering plus shared admin/wallet safety) |
| Booking removal | No active booking links/buttons; removed routes absent from production route table |
| Responsive sweep | 390, 768, 1024, 1440px on key owner/station-detail screens; all Admin routes at 390 and 1440px |
| Mobile live charging and receipt | Passed with a real demo top-up/session, no horizontal overflow |
| Visual inspection | Desktop home, wallet and Admin overview; mobile wallet, connect, live charge and receipt screenshots |

The complete 15-test production suite was followed by a two-line auth/startup error-retention fix discovered by the isolated API test. The final build, lint, isolated API test and two production regression journeys were rerun successfully after that fix.

## Unit coverage

- Lexical two-decimal money parsing; no floating-point currency arithmetic.
- Minimum and configured maximum top-ups.
- Exact integer metering and affordable-energy caps.
- Trusted backend-provided Sandbox redirect URL validation.
- Auth, positive credit, plug, connector, bay/device availability, concurrent session and stale-START checks.
- Idempotent START; pending, acknowledged, failed and timed-out outcomes.
- Deterministic bounded energy, cost and wallet updates.
- All eight stop reasons; completion and debit idempotency.
- Success callback alone has no credit; verified payment posts once; pending/failure/cancel never credit.
- Mandatory-reason audited adjustments; held-fund protection; blocked users.
- Locked session tariff and budget despite later policy/top-up changes.
- One-controller station hierarchy and unique relay assignments.
- Haversine distance calculation.
- API rejection of simulated telemetry/impossible credit holds.
- Bearer token and idempotency header, 401 handling, abort/timeout, schema rejection and 403/409/422/429/500 failures.
- APP_MODE-only demo gating; API failures never select the demo adapter.

## Browser coverage

The current `tests/e2e/credit.spec.ts` covers:

1. Public/owner/admin rendering, meaningful content and browser-error checks.
2. Top-up validation, verification, duplicate callback and refresh persistence.
3. Pending, failed, cancelled and forged callbacks without wallet credit.
4. Manual bay selection, required plug, ACK timeline, live credit use and owner stop.
5. Shared owner/admin adjustment, mandatory reason, blocking/reactivation, credit exhaustion and insufficient balance.
6. Failed and timed-out START, retry, unplug and full-battery completion.
7–9. Geolocation denied, unavailable and timeout with manual fallback.
10. Granted geolocation, distance order, saved filtering, map selection and unavailable-tile fallback.
11. Active route rendering, absence of booking navigation and responsive sweeps.
12. Station creation, primary-device uniqueness, relay-channel uniqueness, tariffs and rollback.
13. Vehicle create/edit/default/delete; persistent profile and notification preferences.
14. Mobile verified top-up, live session, stronger emergency confirmation and final receipt.
15. Admin Stop, offline/reconnect, sensor fault and corresponding owner receipts.

The isolated API test deliberately sets APP_MODE=api while the obsolete DEMO_MODE flag is true. It confirms demo login is absent, private routes require sign-in, and missing backend configuration displays an error/retry with **zero seeded stations**.

## Reproduce

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start -- --port 3001
```

In another terminal, set TEST_BASE_URL=http://localhost:3001 and run `npm run test:e2e`. The API-only spec skips against the demo server.

For API smoke, use the isolated server settings documented in [README](../README.md), with TEST_APP_MODE=api and TEST_BASE_URL=http://localhost:3002, then run `npx playwright test api-mode.spec.ts`.

## Boundaries and observations

- Real Firebase provider login, backend database/authorization, SSLCOMMERZ provider/IPN and physical ESP32 end-to-end operation were **not** available and are not claimed as tested. Their expected contracts are documented in [API-CONTRACT.md](API-CONTRACT.md).
- Browser guards and the demo ledger are not production security/accounting controls.
- The isolated API development server could not download Google Fonts in the restricted network and used Next's fallback. Production builds passed; retained local concept images rendered correctly.
- Tile requests are deliberately aborted in the map-fallback test. The list and marker controls remain usable.
- Node reports the existing package's module-type detection notice during native TypeScript tests. Playwright reports a NO_COLOR/FORCE_COLOR tooling notice. Neither is an application failure.
- Screenshots, traces, .next and .next-api outputs are local and ignored by Git.
