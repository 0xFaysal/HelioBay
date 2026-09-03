import type { Snapshot } from "./model.ts";
export function seed(now = new Date().toISOString(), empty = false): Snapshot {
  const data: Snapshot = { revision: 0, lastTick: now, energy: [], users: [], vehicles: [], stations: [], bays: [], devices: [], wallets: [], ledger: [], payments: [], sessions: [], commands: [], faults: [], notifications:[], audit: [], policy: { maxTopupMinor: 500000, defaultTariffMinor: 1800, demoSpeed: 1, modelScale: 16000, targetBattery: 100, communicationTimeoutMs: 15000 }, previousPolicy: null };
  if (empty) return data;
  data.users = [{ id: "demo-owner", name: "Alex Morgan", email: "owner@heliobay.demo", role: "owner", status: "active", phone: "", city: "Dhaka", savedStations: ["green-point"], preferences: { charging: true, wallet: true, offers: false } }, { id: "demo-admin", name: "Station Partner", email: "admin@heliobay.demo", role: "admin", status: "active", phone: "", city: "Dhaka", savedStations: [], preferences: { charging: true, wallet: true, offers: false } }];
  data.wallets = [{ userId: "demo-owner", balanceMinor: 50000 }, { userId: "demo-admin", balanceMinor: 0 }];
  data.ledger = [{ id: "SEED-CREDIT", userId: "demo-owner", kind: "adjustment", amountMinor: 50000, balanceAfterMinor: 50000, reference: "DEMO-WELCOME", reason: "Explicit demo starting credit — no real payment", status: "posted", sandbox: false, at: now }];
  data.vehicles = [{ id: "ev-demo-owner", ownerId: "demo-owner", name: "My electric crossover", plate: "DHAKA-GA-42-2026", capacityWh: 60000, battery: 64, connector: "CCS2", isDefault: true }];
  const places = [
    { id: "green-point", name: "HelioBay Green Point", address: "Gulshan Avenue, Dhaka", landmark: "Gulshan Lake Park", lat: 23.7937, lng: 90.4066, tariff: 1800, solar: 92, bays: 4 },
    { id: "banani", name: "HelioBay Banani Grove", address: "Road 11, Banani, Dhaka", landmark: "Banani park", lat: 23.793, lng: 90.401, tariff: 2000, solar: 88, bays: 3 },
    { id: "dhanmondi", name: "HelioBay Lakehouse", address: "Dhanmondi 27, Dhaka", landmark: "Dhanmondi Lake", lat: 23.7516, lng: 90.3773, tariff: 1600, solar: 84, bays: 4 },
    { id: "uttara", name: "HelioBay Uttara North", address: "Sector 7, Uttara, Dhaka", landmark: "Uttara Central Park", lat: 23.8759, lng: 90.3795, tariff: 1700, solar: 95, bays: 4 },
    { id: "tejgaon", name: "HelioBay Tejgaon Hub", address: "Tejgaon Link Road, Dhaka", landmark: "Industrial district", lat: 23.7681, lng: 90.4052, tariff: 1500, solar: 76, bays: 2 },
  ];
  places.forEach((p, i) => {
    const deviceId = `ST00${i + 1}`;
    data.stations.push({ id: p.id, name: p.name, address: p.address, landmark: p.landmark, lat: p.lat, lng: p.lng, deviceId, online: i !== 4, priceMinor: p.tariff, powerKw: 60, solarPercent: p.solar, image: "/images/station.webp", amenities: ["Wi-Fi", "Restrooms", "Coffee nearby"], openingHours: "07:00–22:00" });
    data.devices.push({ id: deviceId, stationId: p.id, online: i !== 4, lastSeen: now, firmware: "heliobay-demo/3.0", stationBattery: 84, solarW: 23000, gridBackup: true, gridExport: true, outcome: "success" });
    for (let number = 1; number <= p.bays; number++) data.bays.push({ id: `${p.id}-BAY${String(number).padStart(2, "0")}`, stationId: p.id, deviceId, number, relayChannel: number, connector: "CCS2", enabled: true, plugged: false, fault: false });
  });
  return data;
}
