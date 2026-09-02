# HelioBay — Smart Solar EV Charging Network

The public website and complete EV Owner frontend live in [`frontend/`](frontend/README.md). The existing [`backend/`](backend/) dependency setup is preserved for the future API and charger integration.

## Run the frontend

```sh
cd frontend
npm ci
```

Copy `frontend/.env.example` to `frontend/.env.local`, then run:

```sh
npm run dev
```

Open `http://localhost:3000`, choose **Sign in → Continue in Demo Mode**, and explore the complete booking-to-charging journey. No backend or payment credentials are needed for the demo.

See the frontend README for Firebase setup, all routes, tests, architecture, asset provenance, and the production integration checklist.

## Repository contents

- `frontend/`: Next.js application, local assets, tests, and documentation.
- `backend/`: existing backend package configuration; no operational API is implemented by this frontend task.
- `output/imagegen/`: original generated concept imagery and generation prompts. Optimized copies used by the site are in `frontend/public/images/`.

Environment files, dependencies, build output, and browser-test artifacts are excluded from Git. Repository creation and pushing are left to the project owner, as requested.
