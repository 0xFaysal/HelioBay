# HelioBay — Smart Solar EV Charging Network

The public website, EV Owner app, Station Admin console and shared charging simulator live in [frontend/](frontend/README.md). The existing [backend/](backend/) package setup is preserved for real API and charger integration.

## Run the frontend

```sh
cd frontend
npm ci
```

Copy `frontend/.env.example` to `frontend/.env.local`, then run `npm run dev`.

Open http://localhost:3000 and select **Sign in → Continue in Demo Mode**. Open another tab at `/auth/sign-in?role=admin` for **Continue as Demo Admin**. Both roles share prepaid wallet, station, bay, direct charging and sandbox payment state while keeping separate tab-local sign-ins. Set `NEXT_PUBLIC_APP_MODE=demo` explicitly; the old DEMO_MODE flag no longer enables demo login.

No Firebase, backend or payment credentials are needed in explicitly enabled Demo Mode. API Mode is a separate adapter and reports connection errors without inventing successful data.

See [frontend setup and verification](frontend/README.md) for routes, mode/Firebase variables, tests and simulator limits. See [backend/API and realtime contract](frontend/docs/API-CONTRACT.md) for the integration handoff.

## Repository contents

- `frontend/`: existing Next.js application, generated local assets, owner/Admin features, simulator, API adapters, tests and documentation.
- `backend/`: backend workspace; this frontend milestone does not modify or validate its implementation.
- `output/imagegen/`: original concept imagery and prompts; optimized copies are in `frontend/public/images/`.

Environment files, dependencies, build output and browser-test artifacts are excluded from Git. No controller credentials or payment secrets belong in the frontend.

The current refactor adds automatic solar/storage/grid dispatch, admin energy monitoring and history, a stable-viewport station map, and shared printable charging/top-up receipts. Telemetry is labelled contextually; there is no global demo banner.
