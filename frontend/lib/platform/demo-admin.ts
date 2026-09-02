"use client";
import type { AdminService } from "./contracts";
import { demoActor, cancelDemoBooking } from "./demo";
import { allBookings } from "./selectors";
import { demoTransaction, getSnapshot, useDemoStore } from "@/store/demo-store";
import { audit, finishSession } from "@/lib/demo/engine";
import { createNetwork } from "@/lib/demo/network-seed";
import { overlaps } from "@/lib/services/booking-rules";
import { pricingSchema, stationSchema } from "./schemas";

export const demoAdmin: AdminService = {
  refresh: async () => { demoActor(true); await useDemoStore.persist.rehydrate(); },
  async saveStation(input) {
    const who = demoActor(true);
    const station = stationSchema.parse(input);
    const hours = station.openingHours?.split("–");
    if (hours && (hours[0] >= hours[1] || hours.some(h => Number(h.slice(0, 2)) > 23 || Number(h.slice(3)) > 59))) throw new Error("Opening time must precede closing time on the same day.");
    await demoTransaction(data => {
      const existing = data.network.stations.find(s => s.id === station.id);
      if (existing) {
        if (existing.connector !== station.connector && allBookings(data).some(b => b.stationId === station.id && ["upcoming", "charging"].includes(b.status))) throw new Error("Cancel affected bookings before changing this connector.");
        Object.assign(existing, station);
        if (!station.online || station.maintenance) for (const o of Object.values(data.owners)) for (const s of o.sessions) if (s.stationId === station.id && s.status !== "completed") finishSession(data, s.id, "Station taken out of service", Date.now());
      } else {
        if (data.network.devices.some(d => d.id === station.deviceId)) throw new Error("Device ID is already assigned.");
        const seed = createNetwork(new Date().toISOString(), [{ ...station, available: station.bays }]);
        data.network.stations.push(station); data.network.bays.push(...seed.bays); data.network.devices.push(...seed.devices);
      }
      audit(data, who.id, existing ? "Station updated" : "Station created", station.id, station.name, Date.now());
    });
  },
  async updateBay(stationId, id, patch) {
    const who = demoActor(true);
    await demoTransaction(data => {
      const bay = data.network.bays.find(b => b.stationId === stationId && b.id === id);
      if (!bay) throw new Error("Bay not found.");
      if (patch.deviceId && patch.deviceId !== bay.deviceId) {
        if (!/^[A-Z0-9-]{3,32}$/.test(patch.deviceId) || data.network.devices.some(d => d.id === patch.deviceId)) throw new Error("Choose an unused device ID (3–32 uppercase letters, digits or hyphens).");
        if (Object.values(data.owners).some(o => o.sessions.some(s => s.deviceId === bay.deviceId && s.status !== "completed"))) throw new Error("Finish the bay session before reassigning a device.");
        const d = data.network.devices.find(d => d.id === bay.deviceId)!;
        const station = data.network.stations.find(s => s.id === stationId)!;
        if (station.deviceId === d.id) station.deviceId = patch.deviceId;
        d.id = patch.deviceId; d.telemetry = undefined; d.timeline = [];
      }
      Object.assign(bay, { enabled: patch.enabled ?? bay.enabled, blocked: patch.blocked ?? bay.blocked, maintenance: patch.maintenance ?? bay.maintenance, deviceId: patch.deviceId ?? bay.deviceId });
      if (!bay.enabled || bay.blocked || bay.maintenance) for (const o of Object.values(data.owners)) for (const s of o.sessions) if (s.deviceId === bay.deviceId && s.status !== "completed") finishSession(data, s.id, "Bay disabled by administrator", Date.now());
      audit(data, who.id, "Bay updated", `${stationId}/${id}`, JSON.stringify(patch), Date.now());
    });
  },
  async updateBooking(id, patch) {
    const who = demoActor(true);
    await demoTransaction(data => {
      const b = allBookings(data).find(b => b.id === id);
      if (!b || b.status !== "upcoming") throw new Error("Only upcoming bookings can be changed.");
      if (patch.cancel) { cancelDemoBooking(data, b.ownerId, id, Date.now()); return; }
      const booking = data.owners[b.ownerId].bookings.find(x => x.id === id)!;
      if (patch.bayId) {
        const bay = data.network.bays.find(x => x.stationId === b.stationId && x.id === patch.bayId);
        if (!bay?.enabled || bay.blocked || bay.maintenance) throw new Error("Select an enabled, available bay.");
        if (allBookings(data).some(x => x.id !== id && x.stationId === b.stationId && x.bayId === patch.bayId && overlaps(b.start, b.duration, x))) throw new Error("The new bay has a conflicting booking.");
        if (data.owners[b.ownerId].sessions.some(s => s.bookingId === id && s.status !== "completed")) throw new Error("A session is already attached. Stop it before changing bay.");
        booking.bayId = bay.id;
      }
      if (patch.approved !== undefined) booking.approved = patch.approved;
      audit(data, who.id, "Booking updated", id, JSON.stringify(patch), Date.now());
    });
  },
  async updateFault(id, status, note) {
    const who = demoActor(true);
    if (note.trim().length < 5) throw new Error("Add a maintenance note of at least 5 characters.");
    await demoTransaction(data => {
      const f = data.network.faults.find(f => f.id === id);
      if (!f) throw new Error("Fault not found.");
      const device = data.network.devices.find(d => d.id === f.deviceId);
      if (status === "resolved" && f.code === "OFFLINE" && !device?.online) throw new Error("Reconnect the device before resolving this fault.");
      if (status === "resolved" && f.code === "LOW_BATTERY" && device && device.stationBattery < 15) throw new Error("Restore station battery above 15% before resolving the warning.");
      f.status = status; f.updatedAt = new Date().toISOString();
      if (status === "resolved" && device && f.code === "SENSOR") device.sensorFault = false;
      data.network.maintenance.unshift({ id: `M-${crypto.randomUUID().slice(0, 8)}`, stationId: f.stationId, deviceId: f.deviceId, faultId: id, note: note.trim(), actorId: who.id, createdAt: f.updatedAt });
      audit(data, who.id, `Fault ${status}`, id, note, Date.now());
    });
  },
  async addMaintenance(deviceId, note) {
    const who = demoActor(true);
    if (note.trim().length < 5) throw new Error("Enter at least 5 characters for the maintenance note.");
    await demoTransaction(data => {
      const device = data.network.devices.find(d => d.id === deviceId);
      if (!device) throw new Error("Device not found.");
      data.network.maintenance.unshift({ id: `M-${crypto.randomUUID().slice(0, 8)}`, stationId: device.stationId, deviceId, note, actorId: who.id, createdAt: new Date().toISOString() });
      audit(data, who.id, "Maintenance note added", deviceId, note, Date.now());
    });
  },
  async savePricing(pricing) {
    const who = demoActor(true); const parsed = pricingSchema.parse(pricing);
    await demoTransaction(data => {
      data.network.previousPricing = data.network.pricing; data.network.pricing = parsed;
      for (const station of data.network.stations) station.price = parsed.pricePerKwh;
      audit(data, who.id, "Pricing updated", "network", JSON.stringify(parsed), Date.now());
    });
  },
  async rollbackPricing() {
    const previous = getSnapshot().network.previousPricing;
    if (!previous) throw new Error("No previous pricing version is available.");
    await demoAdmin.savePricing(previous);
  },
  async setSpeed(speed) {
    const who = demoActor(true);
    if (![1, 10, 60].includes(speed)) throw new Error("Choose 1×, 10× or 60×.");
    await demoTransaction(data => { data.network.demoSpeed = speed; data.network.lastTick = new Date().toISOString(); audit(data, who.id, "Demo speed changed", "simulator", `${speed}×`, Date.now()); });
  },
};
