import { defineConfig } from "@playwright/test";
const full=process.env.TEST_FULL_STACK==="true";
const externallyManagedServers=process.env.TEST_SERVERS_MANAGED==="true";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1, timeout: 60000,
  testMatch: ["credit.spec.ts", "api-mode.spec.ts", "energy-map-receipts.spec.ts", "google-auth.spec.ts", "full-stack.spec.ts"],
  expect: { timeout: 12000 }, reporter: "list",
  webServer:full&&!externallyManagedServers?[{command:"node dist/fullstack-test-server.mjs",cwd:"../backend",url:"http://127.0.0.1:4008/health/live",timeout:60000,reuseExistingServer:false,gracefulShutdown:{signal:"SIGINT",timeout:3000},env:{...process.env,NODE_ENV:"test",FULL_STACK_TEST:"true",TEST_DATABASE_URL:"postgresql://heliobay:local_dev_only@localhost:5433/heliobay_test",MQTT_TEST_URL:"mqtt://127.0.0.1:1884"}},{command:"node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3008",url:"http://127.0.0.1:3008",timeout:60000,reuseExistingServer:false,gracefulShutdown:{signal:"SIGINT",timeout:3000},env:{...process.env,NEXT_TELEMETRY_DISABLED:"1",NEXT_PUBLIC_APP_MODE:"api",NEXT_PUBLIC_API_BASE_URL:"http://127.0.0.1:4008",NEXT_PUBLIC_WS_URL:"ws://127.0.0.1:4008/api/v1/realtime",NEXT_PUBLIC_FIREBASE_API_KEY:"test-api-key",NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:"test.firebaseapp.com",NEXT_PUBLIC_FIREBASE_PROJECT_ID:"test",NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:"test",NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:"1",NEXT_PUBLIC_FIREBASE_APP_ID:"1:test:web:test"}}]:undefined,
  use: { baseURL: process.env.TEST_BASE_URL || "http://localhost:3000", channel: "msedge", headless: true, viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure", screenshot: "only-on-failure" },
});
