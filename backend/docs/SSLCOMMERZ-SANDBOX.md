# Credit Wallet and SSLCOMMERZ Sandbox

This backend uses Hosted Payment, the server-side session and validation APIs, and IPN. The implementation follows the [official SSLCOMMERZ v4 integration reference](https://developer.sslcommerz.com/doc/v4/index.html). No card data is collected by HelioBay. Only the Sandbox hostname is used; live mode is rejected.

## Configuration

Keep these values server-side in `backend/.env` or your host's secret store. Do not place them in frontend variables, logs, commits or screenshots.

| Variable | Meaning / default |
|---|---|
| `SSLCOMMERZ_STORE_ID` | Sandbox merchant/store ID |
| `SSLCOMMERZ_STORE_PASSWORD` | Sandbox store password |
| `SSLCOMMERZ_IS_LIVE` | Must be `false`; `true` prevents startup |
| `PUBLIC_APP_URL` | Trusted frontend URL used for result redirects |
| `API_PUBLIC_URL` | Public backend URL used for success/fail/cancel/IPN callbacks |
| `MAX_TOPUP_CREDITS` | Whole-Credit maximum; default 10,000; configurable 10–500,000 |
| `PAYMENT_TTL_MINUTES` | Local checkout availability window; default 30, allowed 5–120 |
| `PAYMENT_GATEWAY_TIMEOUT_MS` | Gateway timeout, default 10,000 ms; allowed 100–30,000 |

Both credentials empty disables initiation with 503 while the remaining backend continues to work. Providing either credential requires the complete payment configuration. Public URLs must use HTTPS except HTTP localhost for local development. Real IPNs require a publicly reachable API URL; a loopback URL is insufficient.

Use a separate Sandbox database. Sandbox wallet Credits are test funds. Existing legacy ledger kinds and VERIFIED payment records remain readable; the API presents VERIFIED as PAID. Historical ledger records retain their original amounts and balances.

## Setup

```powershell
cd E:\project\HelioBay\backend
# If .env does not already exist:
Copy-Item .env.example .env
# Set Firebase credentials, Sandbox credentials and the public URLs in .env.
docker compose up -d
npm run db:generate
npm run db:migrate
npm run build
npm start
```

HelioBay PostgreSQL uses localhost:5433 so ParkEase on 5432 is unaffected. Never reset the database to apply these migrations. They extend the foundation and preserve existing ledger entries.

## Money and ledger semantics

1 Credit = 1 BDT = 100 poisha. Top-up requests accept **whole Credits** only, minimum 10. JSON monetary output is a decimal string of integer poisha. Gateway decimal BDT strings are parsed using BigInt; no floating-point balance math occurs.

Each monetary change inserts an immutable ledger record, whose database trigger locks the wallet, checks available funds, calculates `balanceAfterMinor`, and updates the cached posted balance. Direct balance changes and nonzero opening wallets are rejected. All new records include an actor, idempotency identity, description, timestamp, and applicable payment/session/reservation reference. Metadata has at most 8 short scalar fields and 1 KiB through the service, with a 2 KiB database backstop. Descriptions/reasons must never contain secrets.

Supported kinds: TOP_UP, CHARGING_DEBIT, ADMIN_CREDIT, ADMIN_DEBIT, REVERSAL, REFUND, RESERVATION, RESERVATION_RELEASE. Legacy ADJUSTMENT and DEMO_CREDIT are retained. Reservation events record signed held/released poisha but **do not** change posted balance. Available balance is posted balance minus HELD reservations. To reconcile posted balance, sum monetary entries excluding reservation/release events. Internal `CreditReservations` methods atomically create/release holds and their ledger events; no public request can inject charging costs or holds.

Full reversals append the exact opposite amount and reference the original. They do not delete history and cannot be repeated. Reversing a positive entry requires sufficient unreserved balance. A reversed top-up becomes REVERSED, and later callbacks cannot credit it again. Wallet reversals are accounting corrections, **not gateway refunds**. Provider refund initiation is not exposed by this phase; REFUND remains a ledger kind for a future confirmed refund workflow.

## Owner endpoints

All use Firebase Bearer authentication. Cookies do not authenticate these routes, so browser CSRF cannot authorize wallet operations. CORS remains restricted to configured frontend origins. Callback POSTs are the deliberate public exception and are verified server-to-server.

| Method | Endpoint | Input / result |
|---|---|---|
| POST | `/api/v1/wallet/top-ups` | `{"credits":500}` and required `Idempotency-Key`; 202 with transactionId, status, expiry, safe GatewayPageURL, amountMinor, currency, isSandbox |
| GET | `/api/v1/wallet/top-ups/:transactionId` | Only the transaction owner's safe payment status |
| GET | `/api/v1/me/wallet` | Posted, held and available poisha |
| GET | `/api/v1/me/wallet/ledger?page=1&limit=20` | Immutable own ledger, newest first |

Before initiation the authenticated profile must contain a name (max 50), verified email (max 50), phone (5–20 characters), and city (max 50). Name/phone/city can be updated through PATCH /me. Email is synchronized from a verified Firebase identity. The city is also supplied as the non-shipping customer address; no fabricated address, phone or email is sent.

Top-up initiation allows five attempts per minute per authenticated user, in addition to the foundation IP limit. Reuse a key for retrying the same request. A different amount with the same key returns 409. A timeout after sending initiation leaves a durable PENDING transaction and never automatically creates a second checkout for the same key. Poll/reconcile that transaction; create a new key only for an intentionally separate purchase.

Hosted URLs are restricted to HTTPS sandbox.sslcommerz.com without credentials or nonstandard ports. The raw session key, validation identity, provider payload, store password and card fields are not returned by status or admin-payment endpoints. The hosted URL itself contains the provider's checkout session token and is intended only for its owner.

## Callbacks and states

Public POST routes accept bounded form bodies:

- `/api/v1/payments/sslcommerz/success`
- `/api/v1/payments/sslcommerz/fail`
- `/api/v1/payments/sslcommerz/cancel`
- `/api/v1/payments/sslcommerz/ipn`

Success/IPN with val_id call the Order Validation API. Missing val_id and fail/cancel callbacks use the provider's transaction lookup API, then perform Order Validation for any successful attempt. Callback amounts, status, value_a, owner IDs and other fields are ignored. Amount, original amount, both currencies, transaction ID and validation ID must match authoritative server-to-server results. Only VALID/VALIDATED with explicit risk level 0 can credit. Any other/missing risk value moves a successful validation to RISK_REVIEW without funds. Risk review is sticky: there is no automatic release or admin bypass endpoint; resolve it with the provider before designing an explicitly audited release/refund operation.

States: PENDING, VALIDATING, PAID, FAILED, CANCELLED, EXPIRED, RISK_REVIEW, REVERSED. Risk, mismatch and validation-unavailable cases never become paid automatically. VALIDATING can remain visible during outages; reconciliation retries it. Expiry closes the local checkout window, not the provider's financial truth. A later valid payment can transition EXPIRED/FAILED/CANCELLED to PAID once. PAID/REVERSED never regress on delayed fail/cancel notifications.

Payment-row and wallet-row locks plus unique database indexes guarantee one TOP_UP per payment across concurrent callbacks and IPNs. Payment state and ledger posting commit together. Reconciliation uses the same settlement path.

Successful browser callback processing redirects with HTTP 303 to `/payment/success`, `/payment/cancel` or `/payment/fail`, carrying only `paymentId`. Pending/risk states use the fail result page as a fallback container; **the page must poll the status API and render the actual status**, not infer success/failure from its URL. IPN returns a JSON acknowledgement. Validation errors return 422; unavailable gateways return 503 so notifications can be retried. A missing internal transaction returns 404.

The frontend's existing Snapshot adapter still needs a separate integration change to use this resource API; this backend phase does not silently change that contract.

## Admin endpoints

Require ACTIVE ADMIN, a reason of 5–500 characters, and an Idempotency-Key for mutations. Balance, ledger and audit changes share a transaction.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/admin/users` | User list now includes posted balance/currency |
| GET | `/api/v1/admin/users/:userId/wallet` | Posted/held/available balances |
| GET | `/api/v1/admin/wallet-ledger` | Paginated entries; optional userId and environment=sandbox/live |
| GET | `/api/v1/admin/payments` | Paginated safe transactions; optional userId and environment=sandbox/live |
| POST | `/api/v1/admin/users/:userId/wallet/adjustments` | Credit, debit or full reversal |

Adjustment bodies are unwrapped:

```json
{"kind":"ADMIN_CREDIT","amountMinor":"1000","reason":"Approved correction"}
```

Use ADMIN_DEBIT with a positive amountMinor to subtract funds. A decimal-string integer or safe integer JSON number is accepted, up to 999999999999 poisha. Decimal numeric money, direct balance fields and unknown fields are rejected. New adjustments in this Sandbox implementation are tagged Sandbox. A reversal preserves the original entry's environment:

```json
{"kind":"REVERSAL","ledgerId":"<original-ledger-id>","reason":"Reverse mistaken credit"}
```

Optional metadata is strictly bounded. Reusing the same actor/key/target and body returns the original ledger entry without another audit. Changed requests return 409. Insufficient available Credits return 422, with no partial update or audit success.

## Pending reconciliation

After building, run:

```powershell
node dist/reconcile-payments.js
```

Schedule this command about once per minute through your hosting scheduler, using the same backend environment and database. It selects up to 50 unresolved Sandbox payments from the previous seven days, including expired/failed/cancelled records to recover late successes. A database timestamp claim avoids duplicate scheduled work, and least-recently-checked ordering avoids starving newer payments. Provider validation remains required; lookup alone never credits. Gateway failure leaves the payment unresolved and produces RETRY_REQUIRED without secrets. The command exits nonzero if a retry is required. No scheduler or live deployment was created by this change.

Monitor unresolved records older than seven days and RISK_REVIEW records operationally. Payment status polling is a read/expiry operation; it does not perform a provider call on every browser poll.

## Manual Sandbox test procedure

1. Create a Sandbox store using the official developer portal and configure the credentials/public callback URLs above. Use an isolated database and an actual Firebase test account with completed profile fields. Do not use the demo UID placeholders as login tokens.
2. Record GET /me/wallet and its ledger. With a fresh Idempotency-Key, POST /wallet/top-ups with 10 Credits. Confirm PENDING, amountMinor `1000`, and an unchanged wallet.
3. Open GatewayPageURL in the browser. Use the **current test payment details from SSLCOMMERZ's official documentation**, complete the hosted payment, and allow IPN/callback delivery. Do not collect card fields in HelioBay.
4. Poll GET /wallet/top-ups/:transactionId after returning. Confirm PAID, a 1000-poisha balance increase, and exactly one TOP_UP record. Its balanceAfterMinor should match the new posted balance.
5. Replay the same initiation request/key and resend the same callback/IPN form from a controlled test client. Confirm the same transaction and still one credit. Changing the amount under the same initiation key must return 409.
6. Repeat a new purchase and close the browser before its return. Confirm IPN or the reconciliation command still verifies and credits it once.
7. Test cancellation and a failed payment. Confirm the backend consults the provider and posts no funds for an authoritative failure/cancel. A forged callback amount or browser success URL must never add Credits.
8. In the isolated environment, temporarily make gateway access unavailable. Confirm 503/VALIDATING or unresolved PENDING, unchanged balance, and recovery after restoring connectivity and reconciling.
9. As an admin, add 1000 poisha, retry the same key, and confirm one ledger/audit record. Attempt a debit larger than available funds; expect 422 with no change. Reverse the test credit; confirm the original remains and a reversal is appended.
10. Risk/mismatch/concurrent delivery cases are deterministic in automated tests. If the Sandbox produces a risky response, confirm RISK_REVIEW and no credit; do not override the database to force success.

## Automated verification

```powershell
$env:TEST_DATABASE_URL='postgresql://heliobay:local_dev_only@localhost:5433/heliobay_test'
npm run db:validate
npm run db:generate
npm run lint
npm run typecheck
npm test
npm run build
```

Current result: **91 tests passed across 8 files**, with all PostgreSQL suites enabled. Gateway HTTP is mocked; automated tests never contact the real Sandbox. Migrations were applied to the existing local HelioBay database, preserving foundation data, and independently to fresh test schemas. Lint, type checking, database validation and production build passed. Real merchant credentials were not supplied and a real Sandbox checkout was not executed.
