import type { Bay, Coordinates, Snapshot } from "./model.ts";
export function distance(a: Coordinates, b: Coordinates) {
  const rad = Math.PI / 180; const lat = (b.lat - a.lat) * rad; const lng = (b.lng - a.lng) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(lng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function walletView(data: Snapshot, id: string) {
  const balance = data.wallets.find(w => w.userId === id)?.balanceMinor ?? 0;
  const sessions = data.sessions.filter(s => s.ownerId === id && s.state !== "completed");
  const reserved = sessions.reduce((sum, s) => sum + s.reservedMinor, 0);
  const cost = sessions.reduce((sum, s) => sum + s.costMinor, 0);
  return { balanceMinor: Math.max(0, balance - cost), reservedMinor: Math.max(0, reserved - cost), availableMinor: Math.max(0, balance - reserved) };
}
export function deviceFresh(data: Snapshot, deviceId: string, now = Date.parse(data.lastTick)) {
  const device = data.devices.find(d => d.id === deviceId);
  return Boolean(device?.online && now - Date.parse(device.lastSeen) <= data.policy.communicationTimeoutMs);
}
export function bayState(data: Snapshot, bay: Bay, now = Date.parse(data.lastTick)) {
  if (!bay.enabled) return "DISABLED";
  if (!data.stations.find(s => s.id === bay.stationId)?.online || !deviceFresh(data,bay.deviceId,now)) return "OFFLINE";
  if (bay.fault) return "FAULT";
  if (data.sessions.some(s => s.bayId === bay.id && s.state !== "completed")) return "CHARGING";
  return bay.plugged ? "PLUGGED" : "AVAILABLE";
}
export function availableBays(data: Snapshot, stationId: string, now = Date.parse(data.lastTick)) { return data.bays.filter(b => b.stationId === stationId && ["AVAILABLE", "PLUGGED"].includes(bayState(data, b, now))); }
