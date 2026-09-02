import type { PlatformSnapshot, Station } from "@/types";
export function stationSnapshot(data: PlatformSnapshot, id: string): Station | undefined {
  const station = data.network.stations.find(s => s.id === id);
  if (!station) return;
  const enabledBayIds = data.network.bays.filter(b => b.stationId === id && b.enabled && !b.blocked && !b.maintenance && data.network.devices.some(d => d.id === b.deviceId && d.online)).map(b => b.id);
  const device = data.network.devices.find(d => d.id === station.deviceId);
  return { ...station, enabledBayIds, available: station.online && !station.maintenance ? enabledBayIds.length : 0,
    battery: device?.stationBattery ?? station.battery, pricing: { ...data.network.pricing, pricePerKwh: station.price },
  };
}
export function allBookings(data: PlatformSnapshot) { return Object.entries(data.owners).flatMap(([ownerId, o]) => o.bookings.map(b => ({ ...b, ownerId }))); }
export function allSessions(data: PlatformSnapshot) { return Object.entries(data.owners).flatMap(([ownerId, o]) => o.sessions.map(s => ({ ...s, ownerId }))); }
export function allPayments(data: PlatformSnapshot) { return Object.entries(data.owners).flatMap(([ownerId, o]) => o.payments.map(p => ({ ...p, ownerId }))); }
