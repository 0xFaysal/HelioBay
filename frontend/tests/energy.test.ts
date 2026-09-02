import test from "node:test";
import assert from "node:assert/strict";
import { dispatchEnergy } from "../lib/energy/dispatch.ts";
import { aggregateHistory, createEnergyRecord, meterMinor, recordDispatch, telemetryLabel } from "../lib/energy/adapter.ts";
import { defaultEnergyPolicy, energyPolicySchema, stationTelemetrySchema } from "../lib/energy/model.ts";
import { seed } from "../lib/credit/seed.ts";
import { snapshotSchema } from "../lib/credit/model.ts";
import { advance } from "../lib/credit/engine.ts";
const now = Date.parse("2026-09-03T06:00:00Z");
const base = { solarKw: 20, evDemandKw: 0, socPct: 50, durationMs: 3600000, online: true, gridConnected: true, exportEnabled: true, policy: { ...defaultEnergyPolicy, auxiliaryKw: 0 } };
const near = (a: number, b: number) => assert.ok(Math.abs(a-b) < 1e-8, `${a} != ${b}`);

test("idle solar charges storage, then exports only the remainder", () => {
  const first = dispatchEnergy(base); near(first.batteryKw, 20); near(first.exportKw, 0);
  const full = dispatchEnergy({ ...base, socPct: 95 }); near(full.batteryKw, 0); near(full.exportKw, 20);
  const dark = dispatchEnergy({ ...base, solarKw: 0 }); near(dark.exportKw, 0); near(dark.batteryKw, 0);
});
test("EV automatically uses solar, then battery above reserve, then grid", () => {
  const solar = dispatchEnergy({ ...base, evDemandKw: 10 }); near(solar.evKw, 10); near(solar.batteryKw, 10);
  const mixed = dispatchEnergy({ ...base, evDemandKw: 60 }); near(mixed.batteryKw, -30); near(mixed.importKw, 10);
  const reserved = dispatchEnergy({ ...base, evDemandKw: 30, socPct: 20 }); near(reserved.batteryKw, 0); near(reserved.importKw, 10);
  const battery = dispatchEnergy({ ...base, evDemandKw: 30 }); near(battery.importKw, 0); near(battery.batteryKw, -10);
});
test("SOC boundaries hold even for a long interval", () => {
  const charge = dispatchEnergy({ ...base, solarKw: 100, socPct: 94.9 }); near(charge.nextSocPct, 95); assert.ok(charge.exportKw > 99);
  const discharge = dispatchEnergy({ ...base, solarKw: 0, evDemandKw: 100, socPct: 20.1 }); near(discharge.nextSocPct, 20); assert.ok(discharge.importKw > 99);
});
test("dispatch conserves energy and never imports and exports in one interval", () => {
  for (const solarKw of [0, 1, 30, 200]) for (const evDemandKw of [0, 20, 100]) for (const socPct of [0, 20, 50, 95, 100]) {
    const r = dispatchEnergy({ ...base, solarKw, evDemandKw, socPct });
    near(r.solarKw + r.importKw, r.evKw + r.batteryKw + r.exportKw + r.auxiliaryKw + r.curtailedKw);
    assert.ok(!r.importKw || !r.exportKw); assert.ok(r.nextSocPct >= 0 && r.nextSocPct <= 100);
  }
});
test("auxiliary load, offline state and disconnected grid are explicit", () => {
  const a = dispatchEnergy({ ...base, solarKw: .2, policy: defaultEnergyPolicy }); near(a.auxiliaryKw, .2); near(a.exportKw, 0);
  const offline = dispatchEnergy({ ...base, evDemandKw: 10, online: false }); near(offline.evKw, 0); near(offline.solarKw, 0);
  const noGrid = dispatchEnergy({ ...base, solarKw: 0, socPct: 20, evDemandKw: 10, gridConnected: false }); near(noGrid.unservedKw, 10);
});
test("money derives from exported ENERGY with operator tariff and no per-tick rounding", () => {
  const record = createEnergyRecord("test", 95, now, { ...base.policy, exportTariffMinor: 755 });
  const flow = dispatchEnergy({ ...base, solarKw: 10, socPct: 95 });
  recordDispatch(record, flow, now, 3600000, 0, new Date(now).toISOString(), true);
  assert.equal(record.current.grid.exportEnergyTodayKwh, 10); assert.equal(record.current.finance.exportEarningsMinor, 7550);
  assert.equal(meterMinor(999999), 0); assert.equal(meterMinor(1000000), 1);
  assert.equal(defaultEnergyPolicy.exportTariffMinor, 0);
});
test("historical aggregation sums energy and time-weights battery power", () => {
  const record = createEnergyRecord("test", 50, now);
  recordDispatch(record, dispatchEnergy(base), now, 60000, 0, new Date(now).toISOString(), true);
  recordDispatch(record, dispatchEnergy({ ...base, solarKw: 10 }), now + 3600000, 120000, 0, new Date(now).toISOString(), true);
  const rows = aggregateHistory(record.history, now - 1, now + 7200000, 86400000);
  assert.equal(rows.length, 1); near(rows[0].batteryKw, 40/3); near(rows[0].solarKwh, .666666);
});
test("freshness never presents simulated, stale or offline telemetry as Live", () => {
  const record = createEnergyRecord("test", 50, now); const t = record.current;
  t.controller.status = "online"; assert.equal(telemetryLabel(t, now), "Digital Twin");
  t.telemetrySource = "live"; assert.equal(telemetryLabel(t, now), "Live"); assert.equal(telemetryLabel(t, now + 20000), "Measured · Stale");
  t.controller.status = "offline"; assert.equal(telemetryLabel(t, now), "Measured · Offline");
  t.grid.importPowerKw = 1; t.grid.exportPowerKw = 1; assert.equal(stationTelemetrySchema.safeParse(t).success, false);
});
test("legacy persisted snapshots gain energy records without losing wallet or IDs", () => {
  const legacy = seed(new Date(now).toISOString()); const old = { ...legacy, energy: undefined };
  const parsed = snapshotSchema.parse(old); assert.deepEqual(parsed.energy, []);
  const next = advance(parsed, now + 1000); assert.equal(next.wallets[0].balanceMinor, old.wallets[0].balanceMinor);
  assert.equal(next.devices[0].id, "ST001"); assert.equal(next.energy.length, 5); assert.ok(snapshotSchema.safeParse(next).success);
});
test("energy policy validates reserve and finite tariffs", () => {
  assert.equal(energyPolicySchema.safeParse({ ...defaultEnergyPolicy, minSocPct: 96 }).success, false);
  assert.equal(energyPolicySchema.safeParse({ ...defaultEnergyPolicy, exportTariffMinor: 1.5 }).success, false);
});
