# HelioBay — Smart Solar EV Charging Network

The public website, EV Owner app, Station Admin console and shared charging simulator live in [frontend/](frontend/README.md). The existing [backend/](backend/) package setup is preserved for real API and charger integration.

## Run the frontend

```sh
cd frontend
npm ci
```

Copy `frontend/.env.example` to `frontend/.env.local`, then run `npm run dev`.

Open http://localhost:3000 and select **Sign in → Continue in Demo Mode**. Open another tab at `/auth/sign-in?role=admin` for **Continue as Demo Admin**. Both roles share station, booking, charging and payment state while keeping separate tab-local sign-ins.

No Firebase, backend or payment credentials are needed in explicitly enabled Demo Mode. API Mode is a separate adapter and reports connection errors without inventing successful data.

See [frontend setup and verification](frontend/README.md) for routes, mode/Firebase variables, tests and simulator limits. See [backend/API and realtime contract](frontend/docs/API-CONTRACT.md) for the integration handoff.

## Repository contents

- `frontend/`: existing Next.js application, generated local assets, owner/Admin features, simulator, API adapters, tests and documentation.
- `backend/`: original backend dependency setup; no operational API is implemented by the frontend.
- `output/imagegen/`: original concept imagery and prompts; optimized copies are in `frontend/public/images/`.

Environment files, dependencies, build output and browser-test artifacts are excluded from Git. No MQTT credentials or payment secrets belong in the frontend.
