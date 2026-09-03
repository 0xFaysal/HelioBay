# Development ESP32 simulator

This simulator uses the same signed MQTT protocol, backend billing, REST and WebSocket paths as hardware. All data is labeled SIMULATOR. It is forbidden in production and can charge only demo accounts. Use a separate demo database and Firebase test project. Existing ParkEase containers/ports are not used.

## Setup with direct Node commands

From `E:\project\HelioBay\backend`, dependencies are already installed in this workspace. If setting up a new checkout, run `npm ci` yourself first. The remaining commands bypass the npm launcher:

```powershell
node node_modules/prisma/build/index.js generate
node node_modules/prisma/build/index.js migrate deploy
docker compose -f compose.yaml -f compose.iot.yaml up -d
```

The development broker is available only at `127.0.0.1:1884`; HelioBay PostgreSQL uses port 5433. It is not a production broker configuration.

Set matching backend and simulator environment variables in your local ignored `.env`:

```dotenv
NODE_ENV=development
MQTT_URL=mqtt://127.0.0.1:1884
MQTT_TLS_ENABLED=false
MQTT_CLIENT_ID=heliobay-backend
ALLOW_DEVICE_SIMULATOR=true
SIMULATOR_SPEED=10
SIMULATOR_SCENARIO=normal
```

Generate a local random signing key and put the same value in `SIMULATOR_HMAC_KEY` for both processes. Do not copy an example password or commit the value:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Configure real test-project Firebase UIDs in DEMO_ADMIN_FIREBASE_UID and DEMO_OWNER_FIREBASE_UID before seeding. Placeholder UIDs cannot authenticate. The seed creates 500 demo Credits once; it does not top up on reruns.

```powershell
$env:ALLOW_DEMO_SEED='true'
node node_modules/tsx/dist/cli.mjs prisma/seed.ts
node node_modules/tsx/dist/cli.mjs prisma/provision-simulator.ts
```

Provisioning explicitly marks ST001/ESP32-ST001 as SIMULATOR, sets its speed, stores only the secret reference, opens the demo station, and audits the change. It refuses non-demo inventory or unresolved charging. Re-run provisioning after changing SIMULATOR_SPEED, with no active session; database speed and simulator speed must match.

Start the backend in one terminal:

```powershell
node node_modules/tsx/dist/cli.mjs src/server.ts
```

Start the simulator in another terminal with the same environment:

```powershell
node node_modules/tsx/dist/cli.mjs src/modules/simulator/cli.ts
```

Wait for fresh plug/device status, then send POST `/api/v1/charging-sessions/start` with a real Firebase owner token, an idempotency key and `{stationId:"ST001",bayId:"BAY01",vehicleId:"demo-vehicle"}`. The CLI never starts charging on its own. The default scenario reaches full after 12 active ticks. Solar power follows a fixed four-step pattern. Accelerated mode multiplies energy delivery by 1–60; command expiry and maximum duration remain wall-clock safety bounds.

## Deterministic scenarios

| SIMULATOR_SCENARIO | Behavior after START |
| --- | --- |
| normal | Gradual energy and deterministic solar variation; full after 12 ticks |
| unplug | Battery sense disappears at active tick 4; local relay off and final metering |
| battery-full | Estimated percentage reaches full at tick 4 while battery sense stays present |
| credit-exhausted | Continues until backend stopping margin or local authorized energy limit |
| timeout | MQTT disconnect at tick 3; local energy/duration cutoff continues while offline |
| sensor-fault | Sensor fault at tick 4 and local cutoff |
| emergency-stop | Signed emergency event and cutoff at tick 4 |
| command-failure | Rejects START with relay off and zero energy; hold releases |

For a short credit-exhaustion demo, use the existing audited admin wallet adjustment endpoint to give the idle demo owner a small available balance (for example one Credit), rather than waiting to consume the full seed balance. Do not edit wallet balances directly. A stop before the exact limit can leave a small unused amount because the backend includes relay/sample latency.

The transport's `reconnect()` method supports in-process timeout/reconciliation tests; final state remains available while the simulator process lives. The CLI has no manual reconnect command. If it is killed while a session is unresolved, its memory-only final meter is lost and the backend intentionally keeps the hold. Firmware must persist final metering and command/session identity across reboot; the simulator is not a replacement for that firmware work. Start subsequent normal scenarios only after the current session has settled. TEST and RESTART acknowledgements never energize relays; the simulator's RESTART is a safe diagnostic acknowledgement, not a hardware power-cycle.

## Automated verification

Use the dedicated database whose name ends in `_test`. Each database test uses and removes a unique schema, never the application tables.

```powershell
$env:TEST_DATABASE_URL='postgresql://heliobay:local_dev_only@localhost:5433/heliobay_test'
$env:MQTT_TEST_URL='mqtt://127.0.0.1:1884'
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc -p tsconfig.build.json
```

The broker-backed test starts its own uniquely identified simulator, authenticates owner/admin WebSockets through an injected test verifier, calls the real Express start API, observes an MQTT ACK and telemetry, unplugs, then verifies one final debit, reservation release and both realtime audiences. Production still uses Firebase Admin verification; no test-token bypass exists in server.ts. Without MQTT_TEST_URL the broker-backed test is explicitly skipped; without TEST_DATABASE_URL database suites are explicitly skipped.
