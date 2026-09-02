import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../lib/credit/seed.ts";
import { advance, createPayment, finish, startSession } from "../lib/credit/engine.ts";
import { chargingReceipt, topupReceipt } from "../lib/credit/receipts.ts";
const now = Date.parse("2026-09-03T06:00:00Z"), owner = { id: "demo-owner", role: "owner" as const };
test("charging receipt has exact balances, BDT and generic owner-facing result", () => {
  const d = seed(new Date(now).toISOString()); d.bays[0].plugged = true;
  startSession(d, owner, { stationId: "green-point", bayId: d.bays[0].id, vehicleId: d.vehicles[0].id, requestId: "receipt" }, now);
  const next = advance(d, now + 1500); finish(next, next.sessions[0].id, "DEVICE_OFFLINE", now + 2000);
  const r = chargingReceipt(next, next.sessions[0]); const text = JSON.stringify(r);
  assert.equal(r.userName, "Alex Morgan"); assert.ok(text.includes("Station connection lost")); assert.ok(text.includes("Gulshan Avenue")); assert.ok(text.includes("Opening balance")); assert.ok(text.includes("Closing balance")); assert.ok(text.includes("Equivalent BDT")); assert.ok(!text.includes("ESP32"));
});
test("unverified top-up cannot be presented as a credited receipt", () => {
  const d = seed(new Date(now).toISOString()); const p = createPayment(d, owner, 1001, "PAY", now); const r = topupReceipt(d, p);
  assert.equal(r.title, "Credit top-up record"); assert.equal(r.amount, "0.00 Credits"); assert.equal(r.equivalent, "৳0.00");
});
test("top-up receipt uses its posting balances and provider reference", () => {
  const d = seed(new Date(now).toISOString()); const p = createPayment(d, owner, 1001, "PAY", now); p.submittedAt = p.createdAt; p.demoOutcome = "success"; p.providerReference = "SANDBOX-VERIFIED-01";
  const next = advance(d, now + 2500); const r = topupReceipt(next, next.payments[0]);
  assert.equal(r.title, "Credit top-up receipt"); assert.equal(r.amount, "10.01 Credits"); assert.equal(r.equivalent, "৳10.01");
  assert.ok(JSON.stringify(r).includes("SANDBOX-VERIFIED-01")); assert.ok(JSON.stringify(r).includes("510.01 Credits")); assert.equal(r.sandbox, true);
});
