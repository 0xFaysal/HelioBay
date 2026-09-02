import type { EnergyPolicy } from "./model.ts";

export interface DispatchInput {
  solarKw: number; evDemandKw: number; socPct: number; durationMs: number;
  online: boolean; gridConnected: boolean; exportEnabled: boolean; policy: EnergyPolicy;
}
export interface Dispatch {
  solarKw: number; auxiliaryKw: number; batteryKw: number; evKw: number;
  importKw: number; exportKw: number; curtailedKw: number; unservedKw: number; nextSocPct: number;
}

/** Average powers for one interval. Battery + means charging; - means discharging.
 * Conservation: solar + import = auxiliary + EV + battery + export + curtailment.
 * Limits account for remaining battery energy, so no interval crosses a SOC limit.
 */
export function dispatchEnergy(input: DispatchInput): Dispatch {
  const { policy: p, socPct, durationMs } = input;
  const zero = { solarKw: 0, auxiliaryKw: 0, batteryKw: 0, evKw: 0, importKw: 0, exportKw: 0, curtailedKw: 0, unservedKw: input.evDemandKw, nextSocPct: socPct };
  if (!input.online || durationMs <= 0) return zero;
  const hours = durationMs / 3600000;
  const solarKw = Math.max(0, input.solarKw);
  // EV demand takes solar first while charging; optional auxiliaries use remaining solar.
  // At an idle station this naturally gives auxiliaries first priority before storage.
  const solarToEv = Math.min(solarKw, input.evDemandKw);
  const auxiliaryKw = Math.min(p.auxiliaryKw, solarKw - solarToEv);
  const usableSolar = solarKw - auxiliaryKw;
  const deficit = Math.max(0, input.evDemandKw - solarToEv);
  const dischargeKw = Math.min(deficit, p.maxDischargeKw, Math.max(0, (socPct - p.minSocPct) / 100 * p.capacityKwh / hours));
  const importKw = input.gridConnected ? Math.max(0, deficit - dischargeKw) : 0;
  const evKw = solarToEv + dischargeKw + importKw;
  const surplus = Math.max(0, usableSolar - solarToEv);
  const chargeKw = Math.min(surplus, p.maxChargeKw, Math.max(0, (p.maxSocPct - socPct) / 100 * p.capacityKwh / hours));
  const exportKw = input.gridConnected && input.exportEnabled ? Math.max(0, surplus - chargeKw) : 0;
  const batteryKw = chargeKw - dischargeKw;
  return { solarKw, auxiliaryKw, batteryKw, evKw, importKw, exportKw,
    curtailedKw: Math.max(0, surplus - chargeKw - exportKw), unservedKw: Math.max(0, input.evDemandKw - evKw),
    nextSocPct: Math.max(0, Math.min(100, socPct + batteryKw * hours / p.capacityKwh * 100)),
  };
}

export function flowDescription(t: { solar: { powerKw: number }; battery: { powerKw: number }; evLoad: { powerKw: number }; grid: { exportPowerKw: number; importPowerKw: number } }) {
  if (t.evLoad.powerKw > 0) {
    const sources = [t.solar.powerKw > 0 ? "Solar" : "", t.battery.powerKw < 0 ? "battery" : "", t.grid.importPowerKw > 0 ? "grid" : ""].filter(Boolean);
    return `${sources.join(" + ")} supplying EV charging${t.battery.powerKw > 0 ? " · surplus charging battery" : ""}${t.grid.exportPowerKw > 0 ? " · surplus exported" : ""}`;
  }
  if (t.battery.powerKw > 0) return `Solar charging station battery${t.grid.exportPowerKw > 0 ? " · surplus exported" : ""}`;
  if (t.grid.exportPowerKw > 0) return "Solar surplus exporting to grid";
  return "Station idle";
}
