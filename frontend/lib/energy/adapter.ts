import type { Snapshot } from "../credit/model.ts";
import { defaultEnergyPolicy, type EnergyBucket, type EnergyPolicy, type StationEnergy, type StationTelemetry } from "./model.ts";
import { dispatchEnergy, type Dispatch } from "./dispatch.ts";

const dayKey = (time: number) => new Date(time + 6 * 3600000).toISOString().slice(0, 10);
export const meterMinor = (numerator: number) => Number(BigInt(Math.round(numerator)) / 1000000n);
const meterEnergy = (kw: number, ms: number) => Math.max(0, Math.round(kw * ms / 3.6));
const hourKey = (now: number) => new Date(Math.floor(now / 3600000) * 3600000).toISOString();

export function telemetryFresh(t: StationTelemetry, now: number, timeoutMs = 15000) {
  const age = now - Date.parse(t.timestamp);
  const controllerAge = now - Date.parse(t.controller.lastSeenAt);
  return t.controller.status === "online" && age >= -1000 && age <= timeoutMs && controllerAge >= -1000 && controllerAge <= timeoutMs;
}
export function telemetryLabel(t: StationTelemetry, now: number, timeoutMs = 15000) {
  const source = t.telemetrySource === "digital_twin" ? "Digital Twin" : t.telemetrySource === "estimated" ? "Estimated" : "Live";
  if (t.controller.status === "offline") return `${source === "Live" ? "Measured" : source} · Offline`;
  return telemetryFresh(t, now, timeoutMs) ? source : `${source === "Live" ? "Measured" : source} · Stale`;
}

function bucket(now: number): EnergyBucket {
  return { at: hourKey(now), durationMs: 0, solarMWh: 0, evMWh: 0, importMWh: 0, exportMWh: 0, importNumerator: 0, exportNumerator: 0, batterySocPct: 0, batteryKwMs: 0, source: "digital_twin" };
}
export function recordDispatch(record: StationEnergy, flow: Dispatch, now: number, dt: number, activeSessions: number, lastSeenAt: string, online: boolean, wallMs = dt) {
  // Split wall-clock hour boundaries; simulation speed scales interval energy, not timestamps.
  const start = now - wallMs;
  let cursor = start;
  do {
    const end = Math.min(now, (Math.floor(cursor / 3600000) + 1) * 3600000);
    const duration = wallMs > 0 ? dt * (end - cursor) / wallMs : 0;
    const key = hourKey(cursor);
    let row = record.history.find(r => r.at === key);
    if (!row) { row = bucket(cursor); record.history.push(row); }
    row.durationMs += Math.round(duration);
    row.solarMWh += meterEnergy(flow.solarKw, duration); row.evMWh += meterEnergy(flow.evKw, duration);
    const imported = meterEnergy(flow.importKw, duration), exported = meterEnergy(flow.exportKw, duration);
    row.importMWh += imported; row.exportMWh += exported;
    row.importNumerator += imported * record.policy.importTariffMinor;
    row.exportNumerator += exported * record.policy.exportTariffMinor;
    const remainingFraction = wallMs > 0 ? (now - end) / wallMs : 0;
    row.batterySocPct = flow.nextSocPct - flow.batteryKw * dt / 3600000 / record.policy.capacityKwh * 100 * remainingFraction;
    row.batteryKwMs += flow.batteryKw * duration;
    cursor = end;
  } while (cursor < now);
  record.history = record.history.filter(r => now - Date.parse(r.at) < 31 * 86400000).slice(-800);
  const today = record.history.filter(r => dayKey(Date.parse(r.at)) === dayKey(now));
  const sum = (field: "solarMWh" | "evMWh" | "importMWh" | "exportMWh" | "importNumerator" | "exportNumerator") => today.reduce((n, r) => n + r[field], 0);
  record.current = {
    timestamp: new Date(now).toISOString(), stationId: record.stationId, telemetrySource: "digital_twin",
    solar: { voltageV: online ? 400 : 0, currentA: flow.solarKw * 1000 / 400, powerKw: flow.solarKw, energyTodayKwh: sum("solarMWh") / 1000000 },
    battery: { socPct: flow.nextSocPct, capacityKwh: record.policy.capacityKwh, availableKwh: Math.max(0, flow.nextSocPct - record.policy.minSocPct) / 100 * record.policy.capacityKwh, powerKw: flow.batteryKw, state: flow.batteryKw > 0.000001 ? "charging" : flow.batteryKw < -0.000001 ? "discharging" : "idle" },
    evLoad: { powerKw: flow.evKw, energyTodayKwh: sum("evMWh") / 1000000, activeSessions },
    grid: { importPowerKw: flow.importKw, exportPowerKw: flow.exportKw, importEnergyTodayKwh: sum("importMWh") / 1000000, exportEnergyTodayKwh: sum("exportMWh") / 1000000 },
    finance: { importCostMinor: meterMinor(sum("importNumerator")), exportEarningsMinor: meterMinor(sum("exportNumerator")) },
    controller: { status: online ? "online" : "offline", lastSeenAt }, auxiliaryKw: flow.auxiliaryKw, curtailedKw: flow.curtailedKw,
  };
  record.samples.push(record.current); record.samples = record.samples.slice(-60);
}

export function createEnergyRecord(stationId: string, soc: number, now: number, policy: EnergyPolicy = { ...defaultEnergyPolicy }): StationEnergy {
  const flow = dispatchEnergy({ solarKw: 0, evDemandKw: 0, socPct: soc, durationMs: 1000, online: false, gridConnected: true, exportEnabled: true, policy });
  const record = { stationId, policy, history: [], samples: [] } as unknown as StationEnergy;
  recordDispatch(record, flow, now, 0, 0, new Date(now).toISOString(), false);
  record.history = []; record.samples = [];
  return record;
}

/** Demo adapter only. API snapshots never call this or manufacture missing measurements. */
export function advanceStationEnergy(data: Snapshot, now: number, dt: number, demandBySession: Record<string, number>) {
  const flows: Record<string, Dispatch> = {};
  for (const station of data.stations) {
    const controller = data.devices.find(d => d.id === station.deviceId);
    if (!controller) continue;
    let record = data.energy.find(e => e.stationId === station.id);
    if (!record) {
      record = createEnergyRecord(station.id, controller.stationBattery, now);
      data.energy.push(record);
      // One-time migration of the legacy small-scale solar input; IDs and credit data are unchanged.
      if (controller.solarW > 0 && controller.solarW <= 10) controller.solarW *= 10000;
      controller.gridExport = true;
    }
    const sessions = data.sessions.filter(s => s.stationId === station.id && s.state === "charging");
    const online = station.online && controller.online && now - Date.parse(controller.lastSeen) <= data.policy.communicationTimeoutMs;
    const flow = dispatchEnergy({ solarKw: controller.solarW / 1000, evDemandKw: sessions.reduce((n, s) => n + (demandBySession[s.id] ?? 0), 0), socPct: controller.stationBattery, durationMs: dt, online, gridConnected: controller.gridBackup, exportEnabled: controller.gridExport, policy: record.policy });
    controller.stationBattery = flow.nextSocPct;
    recordDispatch(record, flow, now, dt, sessions.length, online ? new Date(now).toISOString() : controller.lastSeen, online, dt / data.policy.demoSpeed);
    flows[station.id] = flow;
  }
  return flows;
}

export interface HistoryRow { id: string; at: string; solarKwh: number; evKwh: number; importKwh: number; exportKwh: number; batterySocPct: number; batteryKw: number; importCostMinor: number; exportEarningsMinor: number; durationMs: number }
/** Energy sums; time-weighted power; ending SOC. Never sum kW readings as kWh. */
export function aggregateHistory(history: EnergyBucket[], from: number, to: number, intervalMs: number): HistoryRow[] {
  const groups = new Map<number, EnergyBucket[]>();
  for (const r of history) { const time = Date.parse(r.at); if (time < from || time > to) continue; const key = Math.floor((time + 21600000) / intervalMs) * intervalMs - 21600000; groups.set(key, [...(groups.get(key) ?? []), r]); }
  return [...groups].sort(([a], [b]) => a - b).map(([key, rows]) => {
    rows.sort((a, b) => a.at.localeCompare(b.at));
    const sum = (field: keyof Pick<EnergyBucket, "solarMWh" | "evMWh" | "importMWh" | "exportMWh" | "durationMs" | "batteryKwMs" | "importNumerator" | "exportNumerator">) => rows.reduce((n, r) => n + r[field], 0);
    return { id: String(key), at: new Date(key).toISOString(), solarKwh: sum("solarMWh") / 1000000, evKwh: sum("evMWh") / 1000000, importKwh: sum("importMWh") / 1000000, exportKwh: sum("exportMWh") / 1000000, batterySocPct: rows.at(-1)!.batterySocPct, batteryKw: sum("durationMs") ? sum("batteryKwMs") / sum("durationMs") : 0, importCostMinor: meterMinor(sum("importNumerator")), exportEarningsMinor: meterMinor(sum("exportNumerator")), durationMs: sum("durationMs") };
  });
}
