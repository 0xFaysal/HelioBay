import { z } from "zod";

const positive = z.number().finite().nonnegative();
const integer = positive.int().max(Number.MAX_SAFE_INTEGER);
const percent = positive.max(100);
const timestamp = z.string().datetime({ offset: true });

// Tariffs are operator configuration, in poisha/kWh. Zero means unconfigured.
export const energyPolicySchema = z.object({
  capacityKwh: positive.min(1).max(10000), minSocPct: percent, maxSocPct: percent,
  maxChargeKw: positive.max(1000), maxDischargeKw: positive.max(1000), auxiliaryKw: positive.max(100),
  importTariffMinor: integer.max(100000), exportTariffMinor: integer.max(100000),
}).refine(p => p.minSocPct < p.maxSocPct, "Minimum reserve must be below maximum SOC.");
export const defaultEnergyPolicy = {
  capacityKwh: 120, minSocPct: 20, maxSocPct: 95, maxChargeKw: 40, maxDischargeKw: 30,
  auxiliaryKw: 0.5, importTariffMinor: 0, exportTariffMinor: 0,
};
export type EnergyPolicy = z.infer<typeof energyPolicySchema>;

export const stationTelemetrySchema = z.object({
  timestamp, stationId: z.string(), telemetrySource: z.enum(["live", "estimated", "digital_twin"]),
  solar: z.object({ voltageV: positive, currentA: positive, powerKw: positive, energyTodayKwh: positive }),
  battery: z.object({ socPct: percent, capacityKwh: positive, availableKwh: positive, powerKw: z.number().finite(), state: z.enum(["charging", "discharging", "idle"]) }),
  evLoad: z.object({ powerKw: positive, energyTodayKwh: positive, activeSessions: integer }),
  grid: z.object({ importPowerKw: positive, exportPowerKw: positive, importEnergyTodayKwh: positive, exportEnergyTodayKwh: positive }),
  // Integer minor units remain authoritative; convert to BDT only for display.
  finance: z.object({ importCostMinor: integer, exportEarningsMinor: integer }),
  controller: z.object({ status: z.enum(["online", "offline"]), lastSeenAt: timestamp }),
  auxiliaryKw: positive, curtailedKw: positive,
}).refine(t => !(t.grid.importPowerKw > 0.000001 && t.grid.exportPowerKw > 0.000001), "A normalized interval cannot import and export simultaneously.");
export type StationTelemetry = z.infer<typeof stationTelemetrySchema>;

export const energyBucketSchema = z.object({
  at: timestamp, durationMs: integer, solarMWh: integer, evMWh: integer, importMWh: integer, exportMWh: integer,
  // Energy (milli-Wh) × tariff (minor/kWh). Round once, not once per tick.
  importNumerator: integer, exportNumerator: integer,
  batterySocPct: percent, batteryKwMs: z.number().finite(), source: z.enum(["live", "estimated", "digital_twin"]),
});
export type EnergyBucket = z.infer<typeof energyBucketSchema>;
export const stationEnergySchema = z.object({
  stationId: z.string(), policy: energyPolicySchema, current: stationTelemetrySchema,
  history: z.array(energyBucketSchema).max(800), samples: z.array(stationTelemetrySchema).max(60),
});
export type StationEnergy = z.infer<typeof stationEnergySchema>;
