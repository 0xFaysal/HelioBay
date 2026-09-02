# Frontend verification — 2 September 2026

## Environment

- Existing npm project; Next.js 16.3.4, React 19, TypeScript, Tailwind 4 and shadcn Base UI.
- Windows / Node 24, installed Microsoft Edge via Playwright.
- Demo checks do not require Firebase credentials or a backend.
- No dependency changes or formatter installation for this extension.

## Checks

| Check | Result |
| --- | --- |
| ESLint | Pass; no application warnings or errors |
| TypeScript and generated Next route types | Pass |
| Native TypeScript unit tests | 29 passed |
| Production build | Pass; public, owner and all 12 Admin routes generated |
| Production demo browser suites | 12 passed; separate API-only test intentionally skipped |
| Isolated API-mode smoke test | 1 passed against API-configured dev server with no backend URL |
| Responsive owner/public pages | 390, 768, 1024 and 1440px; no horizontal overflow |
| Responsive Admin routes | All 12 routes at 390 and 1440px; mobile navigation, console and runtime assertions |
| Visual inspection | Desktop overview/analytics and mobile device controls/screenshots |

Browser coverage includes owner checkout failure/retry, QR confirmation, persistence, charging commands, normal/emergency stop, automatic completion, refund accounting, vehicle/profile CRUD, search/map filters, location denial and tile failure. Admin coverage includes tab-local roles, cross-tab bay/pricing changes, device command success/failure/timeout, offline recovery, sensor fault resolution, vehicle-removal safety stop, station add/edit, CSV export, sort/pagination, booking approval/reassignment/cancellation, refund approval and pricing rollback.

The API smoke test verifies explicit errors, retry controls and absence of seeded station success when the backend is missing. Unit tests cover token attachment, safe retry, 401, timeout, abort and schema rejection. The physical ESP32, Firebase project, payment providers and real backend are not connected or claimed to have been tested.

## Environment observations

- Restricted network access can deny OpenStreetMap tile downloads. The fallback banner, markers and station list remain usable; this failure path is tested. The browser error check excludes the network sandbox's explicit ERR_NETWORK_ACCESS_DENIED message, not application errors.
- Node's native TypeScript runner reports a module-type detection notice because the existing package has no explicit module type. Tests pass; the unrelated package module convention is preserved.
- Generated `.next-api` output is ignored by lint and Git, just like `.next`.
- Test screenshots/traces are generated locally and excluded from Git. See the README for repeatable test commands.
