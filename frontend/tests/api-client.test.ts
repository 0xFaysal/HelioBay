import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { createApiClient, ApiError } from "../lib/api/client.ts";
import { resolveMode } from "../lib/config.ts";
import { telemetrySchema, acknowledgementSchema } from "../lib/platform/schemas.ts";
const schema = z.object({ value: z.number() });
test("demo fallback is opt-in; API mode never falls back", () => {
  assert.equal(resolveMode(undefined, undefined), "api"); assert.equal(resolveMode("api", "true"), "api"); assert.equal(resolveMode("demo", "false"), "api"); assert.equal(resolveMode("demo", "true"), "demo");
});
test("missing API configuration fails honestly", async () => {
  const client = createApiClient({ baseUrl: "", token: async () => null, unauthorized() {} });
  await assert.rejects(client("/stations", schema), (e: unknown) => e instanceof ApiError && e.code === "CONFIGURATION");
});
test("auth token attached; safe GET can retry but POST cannot", async () => {
  let calls = 0;
  const client = createApiClient({ baseUrl: "https://backend.example", token: async () => "test-token", unauthorized() {}, fetcher: async (_url, options) => {
    assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer test-token"); calls++;
    if (calls === 1) throw new Error("offline"); return new Response(JSON.stringify({ value: 4 }));
  } });
  assert.equal((await client("/stations", schema)).value, 4); assert.equal(calls, 2);
  calls = 0; await assert.rejects(client("/bookings", schema, { method: "POST", body: {} })); assert.equal(calls, 1);
});
test("401 invokes unauthorized handling and invalid JSON/data are rejected", async () => {
  let expired = false;
  const options = { baseUrl: "https://backend.example", token: async () => null, unauthorized() { expired = true; } };
  await assert.rejects(createApiClient({ ...options, fetcher: async () => new Response("{}", { status: 401 }) })("/me", schema)); assert.equal(expired, true);
  for (const body of ["not json", JSON.stringify({ value: "bad" })]) await assert.rejects(createApiClient({ ...options, fetcher: async () => new Response(body) })("/stations", schema), (e: unknown) => e instanceof ApiError && e.code === "INVALID_RESPONSE");
});
test("AbortSignal cancels without retry and timeout is bounded", async () => {
  let calls = 0;
  const client = createApiClient({ baseUrl: "https://backend.example", token: async () => null, unauthorized() {}, timeoutMs: 5, fetcher: (_url, options) => new Promise((_resolve, reject) => { calls++; options!.signal!.addEventListener("abort", () => reject(new Error("aborted"))); }) });
  const controller = new AbortController(); controller.abort(); await assert.rejects(client("/stations", schema, { signal: controller.signal })); assert.equal(calls, 0);
  await assert.rejects(client("/bookings", schema, { method: "POST" }), (e: unknown) => e instanceof ApiError && e.code === "TIMEOUT"); assert.equal(calls, 1);
});
test("external telemetry and acknowledgements reject corrupt values", () => {
  assert.equal(telemetrySchema.safeParse({ deviceId: "ST001", carBatteryPercent: 150 }).success, false);
  assert.equal(acknowledgementSchema.safeParse({ commandId: "CMD", success: "yes" }).success, false);
});
