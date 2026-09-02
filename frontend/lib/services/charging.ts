"use client";
import type { ChargingStatus, Session } from "@/types";
import { getOwnerData, useDemoStore } from "@/store/demo-store";
import { stationService } from "./stations";
const transitions: Record<ChargingStatus, ChargingStatus[]> = {
  waiting: ["car-detected", "offline", "fault", "completed"], "car-detected": ["starting", "offline", "fault", "completed"], starting: ["charging", "fault", "offline", "completed"], charging: ["paused", "completed", "offline", "fault"], paused: ["charging", "completed", "offline", "fault"], offline: ["waiting", "completed"], fault: ["waiting", "completed"], completed: [],
};
export const chargingService = {
  enter(bookingId: string) {
    const data = getOwnerData(); const booking = data.bookings.find(b => b.id === bookingId);
    if (!booking || !["upcoming", "charging"].includes(booking.status)) throw new Error("This booking cannot start a charging session.");
    const existing = data.sessions.find(s => s.bookingId === bookingId); if (existing) return existing;
    const vehicle = data.vehicles.find(v => v.id === booking.vehicleId); const station = stationService.get(booking.stationId);
    if (!vehicle || !station) throw new Error("Vehicle or station not found.");
    if (data.sessions.some(s => ["charging", "paused", "starting"].includes(s.status))) throw new Error("Finish your active session before starting another.");
    const now = new Date().toISOString();
    const session: Session = { id: `CS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, bookingId, stationId: station.id, vehicleId: vehicle.id, status: "waiting", battery: vehicle.battery, initialBattery: vehicle.battery, energy: 0, elapsed: 0, power: 0, solar: station.solar, createdAt: now, updatedAt: now, points: [{ minute: 0, power: 0 }] };
    useDemoStore.getState().update(d => ({ ...d, sessions: [session, ...d.sessions] })); return session;
  },
  transition(id: string, status: ChargingStatus) {
    const data = getOwnerData(); const session = data.sessions.find(s => s.id === id);
    if (!session || !transitions[session.status].includes(status)) throw new Error("This action is not available in the current state.");
    if (["starting", "charging"].includes(status) && data.sessions.some(s => s.id !== id && ["starting", "charging", "paused"].includes(s.status))) throw new Error("Another charging session is active.");
    const station = stationService.get(session.stationId)!; const now = new Date().toISOString();
    useDemoStore.getState().update(d => ({ ...d, sessions: d.sessions.map(s => s.id === id ? { ...s, status, power: status === "charging" ? station.power * .7 : 0, updatedAt: now } : s), bookings: d.bookings.map(b => b.id === session.bookingId ? { ...b, status: status === "completed" ? "completed" : ["starting", "charging", "paused"].includes(status) ? "charging" : b.status } : b) }));
    if (status === "completed") this.settle(id);
  },
  tick(id: string, now = Date.now()) {
    const d = getOwnerData(); const s = d.sessions.find(x => x.id === id); if (!s || s.status !== "charging") return;
    const vehicle = d.vehicles.find(v => v.id === s.vehicleId); const booking = d.bookings.find(b => b.id === s.bookingId); if (!vehicle || !booking) return;
    const elapsedDelta = Math.max(0, Math.min((now - new Date(s.updatedAt).getTime()) / 1000, booking.duration * 60 - s.elapsed));
    const energy = Math.min(s.energy + s.power * elapsedDelta / 3600, vehicle.capacity * (100 - s.initialBattery) / 100);
    const battery = Math.min(100, s.initialBattery + energy / vehicle.capacity * 100); const elapsed = s.elapsed + elapsedDelta;
    useDemoStore.getState().update(data => ({ ...data, sessions: data.sessions.map(x => x.id === id ? { ...x, energy, battery, elapsed, updatedAt: new Date(now).toISOString(), points: [...x.points, { minute: Math.round(elapsed / 60 * 10) / 10, power: x.power }].slice(-60) } : x), vehicles: data.vehicles.map(v => v.id === s.vehicleId ? { ...v, battery } : v) }));
    if (battery >= 100 || elapsed >= booking.duration * 60) this.transition(id, "completed");
  },
  settle(id: string) {
    const d = getOwnerData(); const s = d.sessions.find(x => x.id === id); if (!s) return;
    const b = d.bookings.find(x => x.id === s.bookingId); const station = stationService.get(s.stationId); if (!b || !station || d.payments.some(p => p.id === `SETTLE-${id}`)) return;
    const total = Math.round(s.energy * station.price * (b.discount > 0 ? .9 : 1)) + b.fee; const balance = total - b.advance;
    useDemoStore.getState().update(data => ({ ...data, payments: [{ id: `SETTLE-${id}`, bookingId: b.id, amount: Math.abs(balance), method: "Demo settlement", kind: balance < 0 ? "refund" : "payment", status: "succeeded", createdAt: new Date().toISOString(), description: balance < 0 ? "Unused advance returned · simulated" : "Session balance · simulated" }, ...data.payments] }));
  },
};
