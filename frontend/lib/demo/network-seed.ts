import type { Device, NetworkData, PricingRule, Station } from "@/types";
import { stations } from "./seed.ts";

export const defaultPricing: PricingRule = {
  pricePerKwh: 18, bookingFee: 20, cancellationFee: 0, peakMultiplier: 1,
  demoScalingFactor: 16000, promoPercent: 10, taperFactor: .75, targetBattery: 100,
};

export function createNetwork(now = new Date().toISOString(), source: Station[] = stations): NetworkData {
  const bays = source.flatMap(s => Array.from({ length: s.bays }, (_, i) => ({
    id: `BAY${String(i + 1).padStart(2, "0")}`, stationId: s.id,
    deviceId: i === 0 ? s.deviceId : `${s.deviceId}-${i + 1}`,
    enabled: true, blocked: i >= s.available, maintenance: false,
  })));
  const devices: Device[] = bays.map(b => {
    const s = source.find(s => s.id === b.stationId)!;
    return { id: b.deviceId, stationId: s.id, bayId: b.id, online: s.online,
      vehicleDetected: false, mosfetOn: false, firmware: "helio-demo/2.0.0",
      lastSeen: now, stationBattery: s.battery, solarPower: 1.8, gridBackup: true,
      gridExport: false, sensorFault: false, testMode: false, commandOutcome: "success", timeline: [],
    };
  });
  return {
    stations: source.map(s => ({ ...s, openingHours: "07:00–22:00", maintenance: false })),
    bays, devices, commands: [], acknowledgements: [], maintenance: [], audit: [],
    refunds: source.length ? [{ id: "RF-REVIEW01", paymentId: "RF-REVIEW01", bookingId: "HB-DEMO02", ownerId: "demo-owner", amount: 20, status: "pending", reason: "Demo metering reconciliation · operator review", createdAt: now }] : [],
    faults: source.filter(s => !s.online).map(s => ({
      id: `FAULT-${s.deviceId}`, stationId: s.id, deviceId: s.deviceId, severity: "warning",
      code: "OFFLINE", message: "Device offline. Inspect connection before returning to service.",
      status: "open", createdAt: now, updatedAt: now,
    })),
    pricing: { ...defaultPricing }, previousPricing: null, demoSpeed: 1, lastTick: now,
    solarWh: 0, gridWh: 0, exportWh: 0, energyHistory: [],
  };
}

export const emptyNetwork = (): NetworkData => createNetwork("1970-01-01T00:00:00.000Z", []);
