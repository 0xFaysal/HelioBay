import test from "node:test";
import assert from "node:assert/strict";
import { createNetwork } from "../lib/demo/network-seed.ts";
import { createOwnerData, demoAccounts } from "../lib/demo/seed.ts";
import { advanceEngine, assertStart, issueCommand, finishSession, estimateRemainingMinutes } from "../lib/demo/engine.ts";
import type { PlatformSnapshot, Session } from "../types/index.ts";
const now = Date.parse("2026-09-02T08:00:00Z");
function fixture(): PlatformSnapshot {
  const owner = createOwnerData("Alex", true, new Date(now), "demo-owner");
  const s: Session = { id: "S-1", bookingId: "HB-DEMO01", stationId: "green-point", deviceId: "ST001", bayId: "BAY01", vehicleId: "ev-demo-owner", status: "car-detected", battery: 64, initialBattery: 64, energy: 0, energyWh: 0, elapsed: 0, power: 0, solar: 90, updatedAt: new Date(now).toISOString(), createdAt: new Date(now).toISOString(), points: [], targetBattery: 100 };
  owner.sessions.unshift(s);
  const data = { network: createNetwork(new Date(now).toISOString()), owners: { "demo-owner": owner } };
  data.network.devices[0].vehicleDetected = true;
  return data;
}
const session = (d: PlatformSnapshot) => d.owners["demo-owner"].sessions[0];
function start(d = fixture()) { issueCommand(d, demoAccounts.owner, "ST001", "START", "S-1", false, now, "CMD-1"); return advanceEngine(d, now + 1500); }
test("charging prerequisites reject missing identity, presence, connection, payment, bay and faults", () => {
  assert.throws(() => assertStart(fixture(), null, "ST001", "S-1"), /Sign in/);
  for (const change of [
    (d: PlatformSnapshot) => { d.network.devices[0].vehicleDetected = false; },
    (d: PlatformSnapshot) => { d.network.devices[0].online = false; },
    (d: PlatformSnapshot) => { d.network.stations[0].online = false; },
    (d: PlatformSnapshot) => { d.network.bays[0].enabled = false; },
    (d: PlatformSnapshot) => { d.owners["demo-owner"].payments = []; },
    (d: PlatformSnapshot) => { d.network.devices[0].sensorFault = true; },
  ]) { const d = fixture(); change(d); assert.throws(() => assertStart(d, demoAccounts.owner, "ST001", "S-1")); }
});
test("another session on the same bay is rejected even across accounts", () => {
  const d = fixture(); d.owners.other = structuredClone(d.owners["demo-owner"]); d.owners.other.sessions[0].id = "OTHER";
  assert.throws(() => assertStart(d, demoAccounts.owner, "ST001", "S-1"), /already owns/);
});
test("START pending does not energize until acknowledgement", () => {
  const d = fixture(); issueCommand(d, demoAccounts.owner, "ST001", "START", "S-1", false, now, "CMD-1");
  assert.equal(d.network.commands[0].status, "pending"); assert.equal(d.network.devices[0].mosfetOn, false);
  const next = advanceEngine(d, now + 1500); assert.equal(next.network.commands[0].status, "acknowledged"); assert.equal(session(next).status, "charging"); assert.equal(next.network.devices[0].mosfetOn, true);
});
test("telemetry advances deterministically, with separate Wh and equivalent kWh", () => {
  const d = start(); const a = advanceEngine(d, now + 2500), b = advanceEngine(d, now + 2500);
  assert.deepEqual(a, b); assert.ok(session(a).energy > session(d).energy); assert.ok(session(a).battery > 64);
  const t = a.network.devices[0].telemetry!; assert.ok(t.carBatteryVoltage! >= 3 && t.carBatteryVoltage! <= 4.2); assert.ok(t.chargingCurrent! <= .48); assert.equal(t.simulated, true);
  assert.ok(Math.abs(session(a).energy - session(a).energyWh! * a.network.pricing.demoScalingFactor / 1000) < 1e-8);
});
test("failed and timed-out commands never energize the charger", () => {
  for (const outcome of ["failure", "timeout"] as const) {
    const d = fixture(); d.network.devices[0].commandOutcome = outcome;
    issueCommand(d, demoAccounts.owner, "ST001", "START", "S-1", false, now, "CMD-1");
    const next = advanceEngine(d, now + 6500); assert.equal(next.network.commands[0].status, outcome === "failure" ? "failed" : "timed-out"); assert.equal(next.network.devices[0].mosfetOn, false); assert.equal(session(next).energy, 0);
  }
});
test("acknowledged STOP freezes energy and creates exactly one settlement/refund", () => {
  const d = start(); issueCommand(d, demoAccounts.owner, "ST001", "STOP", "S-1", false, now + 2000, "CMD-2");
  const next = advanceEngine(d, now + 3500); assert.equal(session(next).status, "completed");
  const energy = session(next).energy; finishSession(next, "S-1", "duplicate", now + 4000);
  assert.equal(advanceEngine(next, now + 5000).owners["demo-owner"].sessions[0].energy, energy);
  assert.equal(next.owners["demo-owner"].payments.filter(p => p.id === "SETTLE-S-1").length, 1);
  assert.ok(next.network.refunds.some(r => r.id === "RF-S-1"));
});
test("charge limit and reserved time automatically complete", () => {
  const d = fixture(); session(d).targetBattery = 64.001;
  assert.equal(session(start(d)).status, "completed");
  const other = start(); session(other).elapsed = 3599; assert.equal(session(advanceEngine(other, now + 3500)).status, "completed");
});
test("vehicle removal stops safely; offline interrupts without fabricated energy", () => {
  const d = start(); d.network.devices[0].vehicleDetected = false;
  const stopped = advanceEngine(d, now + 2500); assert.equal(session(stopped).status, "completed"); assert.match(session(stopped).stopReason!, /Vehicle removed/);
  const other = start(); other.network.devices[0].online = false;
  const offline = advanceEngine(other, now + 2500); assert.equal(session(offline).status, "offline"); assert.equal(session(offline).energy, session(other).energy); assert.equal(offline.network.devices[0].mosfetOn, false);
});
test("sensor faults clear precision and disabled bays stop charging", () => {
  const d = start(); d.network.devices[0].sensorFault = true; const fault = advanceEngine(d, now + 2500);
  assert.equal(session(fault).status, "fault"); assert.equal(fault.network.devices[0].telemetry!.chargingPower, null);
  const other = start(); other.network.bays[0].enabled = false; assert.equal(session(advanceEngine(other, now + 2500)).status, "completed");
});
test("emergency stop is immediate and latches a blocking fault", () => {
  const d = start(); issueCommand(d, demoAccounts.owner, "ST001", "EMERGENCY_STOP", "S-1", false, now + 2000, "CMD-E");
  assert.equal(session(d).status, "completed"); assert.equal(d.network.devices[0].mosfetOn, false); assert.ok(d.network.faults.some(f => f.code === "EMERGENCY" && f.status === "open"));
});
test("60× demo speed accelerates time; histories are bounded", () => {
  const d = start(); d.network.demoSpeed = 60; const next = advanceEngine(d, now + 2500); assert.ok(session(next).elapsed - session(d).elapsed >= 59);
  let running = start(); for (let i = 2; i < 80; i++) running = advanceEngine(running, now + i * 1000);
  assert.ok(session(running).points.length <= 60); assert.ok(running.network.devices.every(d => d.timeline.length <= 60));
});
test("remaining time handles missing data and taper", () => {
  assert.equal(estimateRemainingMinutes(3.7, null, 3.9, .48, .75), null);
  assert.equal(estimateRemainingMinutes(3.7, 60, 3.9, 0, .75), null);
  assert.ok(estimateRemainingMinutes(3.7, 60, 3.9, .48, .75)! > estimateRemainingMinutes(3.7, 60, 3.9, .48, 1)!);
});
