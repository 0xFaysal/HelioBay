"use client";
import type { Account, Booking, PlatformSnapshot, Session } from "@/types";
import type { PlatformServices } from "./contracts";
import { demoTransaction, getSnapshot, useDemoStore } from "@/store/demo-store";
import { addFault, advanceEngine, audit, issueCommand, locateSession, finishSession } from "@/lib/demo/engine";
import { estimateCost, priceAt, refundableAmount, validateBooking } from "@/lib/services/booking-rules";
import { allBookings, stationSnapshot } from "./selectors";
import { deviceSchema } from "./schemas";
import { demoAdmin } from "./demo-admin";

export function demoActor(admin = false): Account {
  const s = useDemoStore.getState();
  if (!s.activeId) throw new Error("Please sign in to continue.");
  const account = s.demoAccount ?? { id: s.activeId, role: "owner" as const, name: "Owner", email: "", demo: false };
  if (admin && account.role !== "admin") throw new Error("Administrator access is required.");
  return account;
}
export function cancelDemoBooking(data: PlatformSnapshot, ownerId: string, id: string, now: number) {
  const owner = data.owners[ownerId];
  const booking = owner?.bookings.find(b => b.id === id);
  if (!booking || booking.status !== "upcoming") throw new Error("Only upcoming bookings can be cancelled.");
  const amount = refundableAmount(booking, now);
  booking.status = "cancelled";
  for (const s of owner.sessions.filter(s => s.bookingId === id)) { s.status = "completed"; s.power = 0; s.stopReason = "Booking cancelled"; }
  for (const c of data.network.commands.filter(c => c.sessionId && owner.sessions.some(s => s.id === c.sessionId && s.bookingId === id) && c.status === "pending")) c.status = "failed";
  const paymentId = `RF-CANCEL-${id}`;
  if (amount && !owner.payments.some(p => p.id === paymentId)) {
    owner.payments.unshift({ id: paymentId, bookingId: id, amount, method: "Demo refund", kind: "refund", status: "succeeded", createdAt: new Date(now).toISOString(), description: "Cancellation refund · simulated" });
    const original = owner.payments.find(p => p.id === booking.paymentId);
    if (original) original.status = "refunded";
    data.network.refunds.unshift({ id: paymentId, paymentId, bookingId: id, ownerId, amount, status: "succeeded", reason: "Cancellation refund (automatic)", createdAt: new Date(now).toISOString() });
  }
  audit(data, demoActor().id, "Booking cancelled", id, `Simulated refund ৳${amount}`, now);
  return amount;
}

export const demoPlatform: PlatformServices = {
  snapshot: getSnapshot,
  refresh: async () => { await useDemoStore.persist.rehydrate(); },
  saveOwner: async owner => { const who = demoActor(); await demoTransaction(data => { data.owners[who.id] = owner; }); },
  stations: {
    list: async () => getSnapshot().network.stations.map(s => stationSnapshot(getSnapshot(), s.id)!),
    get: id => stationSnapshot(getSnapshot(), id),
  },
  bookings: {
    async reserve(input) {
      const who = demoActor();
      await new Promise(r => setTimeout(r, 650));
      if (demoActor().id !== who.id) throw new Error("Your account changed. Please try again.");
      return demoTransaction(data => {
        const owner = data.owners[who.id];
        if (!owner || who.role !== "owner") throw new Error("Sign in as an EV Owner to make a booking.");
        const existing = owner.bookings.find(b => b.id === input.requestId);
        if (existing) return existing;
        if (input.method === "Test failure") throw new Error("Test payment declined. No money was taken and no slot was reserved. Choose another method and retry.");
        if (!["bKash", "Nagad", "Card", "Test payment"].includes(input.method)) throw new Error("Choose a payment method.");
        if (input.promo && input.promo.toUpperCase() !== "HELIO10") throw new Error("Promo code not recognized. Try HELIO10.");
        const station = stationSnapshot(data, input.stationId);
        if (!station) throw new Error("Station not found.");
        const vehicle = owner.vehicles.find(v => v.id === input.vehicleId);
        const bayId = validateBooking(station, vehicle, input.start, input.duration, allBookings(data));
        const cost = estimateCost(station, input.duration, input.promo, vehicle, input.start);
        const now = new Date().toISOString();
        const booking: Booking = {
          id: input.requestId, stationId: station.id, vehicleId: input.vehicleId, start: input.start, duration: input.duration,
          bayId, status: "upcoming", estimate: cost.estimate, advance: cost.advance, fee: cost.fee, discount: cost.discount,
          paymentId: `TX-${input.requestId}`, createdAt: now, ownerId: who.id, approved: true,
          unitPrice: priceAt(station, input.start), cancellationFee: data.network.pricing.cancellationFee,
          discountRate: input.promo ? data.network.pricing.promoPercent : 0,
        };
        owner.bookings.unshift(booking);
        owner.payments.unshift({ id: booking.paymentId, bookingId: booking.id, amount: cost.advance, method: input.method, kind: "payment", status: "succeeded", createdAt: now, description: "Reservation advance" });
        owner.notificationsRead = false;
        audit(data, who.id, "Booking created", booking.id, `${station.name} · ${bayId}`, Date.parse(now));
        return booking;
      });
    },
    async cancel(id) { const who = demoActor(); return demoTransaction(data => cancelDemoBooking(data, who.id, id, Date.now())); },
  },
  charging: {
    async enter(bookingId) {
      const who = demoActor();
      return demoTransaction(data => {
        const ownerId = who.role === "admin" ? allBookings(data).find(b => b.id === bookingId)?.ownerId : who.id;
        const owner = ownerId && data.owners[ownerId];
        const booking = owner && owner.bookings.find(b => b.id === bookingId);
        if (!owner || !booking || !["upcoming", "charging"].includes(booking.status)) throw new Error("This booking cannot start a charging session.");
        const existing = owner.sessions.find(s => s.bookingId === bookingId);
        if (existing) return existing;
        const vehicle = owner.vehicles.find(v => v.id === booking.vehicleId);
        const bay = data.network.bays.find(b => b.stationId === booking.stationId && b.id === booking.bayId);
        if (!vehicle || !bay) throw new Error("Vehicle or bay not found.");
        if (Object.values(data.owners).some(o => o.sessions.some(s => s.status !== "completed" && (s.vehicleId === vehicle.id || s.deviceId === bay.deviceId)))) throw new Error("Finish the active vehicle or bay session first.");
        const now = new Date().toISOString();
        const session: Session = { id: `CS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, bookingId, stationId: booking.stationId, vehicleId: vehicle.id,
          status: "waiting", battery: vehicle.battery, initialBattery: vehicle.battery, energy: 0, energyWh: 0, elapsed: 0,
          power: 0, solar: 0, updatedAt: now, createdAt: now, points: [{ minute: 0, power: 0 }], bayId: bay.id, deviceId: bay.deviceId,
          targetBattery: data.network.pricing.targetBattery,
        };
        owner.sessions.unshift(session);
        return session;
      });
    },
    async command(id, name, override = false) {
      const found = locateSession(getSnapshot(), id);
      if (!found?.session.deviceId) throw new Error("Session has no assigned device.");
      return demoPlatform.devices.command(found.session.deviceId, name, id, override);
    },
    async presence(id, present) {
      const who = demoActor();
      await demoTransaction(data => {
        const found = locateSession(data, id);
        if (!found || who.role !== "admin" && found.ownerId !== who.id) throw new Error("Session access denied.");
        const device = data.network.devices.find(d => d.id === found.session.deviceId);
        if (!device) throw new Error("Device not found.");
        device.vehicleDetected = present;
        if (["waiting", "car-detected"].includes(found.session.status)) found.session.status = present ? "car-detected" : "waiting";
        if (!present && ["charging", "paused", "starting"].includes(found.session.status)) finishSession(data, id, "Vehicle removed — automatic safety stop", Date.now());
        audit(data, who.id, "Demo vehicle presence", device.id, String(present), Date.now());
      });
    },
  },
  devices: {
    async command(deviceId, name, sessionId, override = false) {
      const who = demoActor();
      return demoTransaction(data => issueCommand(data, who, deviceId, name, sessionId, override, Date.now(), `CMD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`));
    },
    async configure(id, patch) {
      const who = demoActor(true);
      await demoTransaction(data => {
        const device = data.network.devices.find(d => d.id === id);
        if (!device) throw new Error("Device not found.");
        Object.assign(device, deviceSchema.parse({ ...device, ...patch }));
        if (patch.sensorFault === true) addFault(data, device, "SENSOR", "INA3221 sensor fault. Telemetry is unavailable; inspect before resuming.", Date.now());
        if (patch.online === true) for (const f of data.network.faults) if (f.deviceId === id && f.code === "OFFLINE") { f.status = "resolved"; f.updatedAt = new Date().toISOString(); }
        if (patch.vehicleDetected === true) for (const o of Object.values(data.owners)) for (const s of o.sessions) if (s.deviceId === id && s.status === "waiting") s.status = "car-detected";
        audit(data, who.id, "Device simulation changed", id, JSON.stringify(patch), Date.now());
        Object.assign(data, advanceEngine(data, Date.now()));
      });
    },
  },
  telemetry: { get: async stationId => getSnapshot().network.devices.filter(d => d.stationId === stationId && d.telemetry).map(d => d.telemetry!) },
  payments: {
    simulate: input => demoPlatform.bookings.reserve(input),
    async approveRefund(id) {
      const who = demoActor(true);
      await demoTransaction(data => {
        const refund = data.network.refunds.find(r => r.id === id);
        if (!refund || refund.status !== "pending") throw new Error("Only pending refunds can be approved.");
        const owner = data.owners[refund.ownerId];
        if (!owner) throw new Error("Refund owner not found.");
        refund.status = "succeeded";
        if (!owner.payments.some(p => p.id === refund.paymentId)) owner.payments.unshift({ id: refund.paymentId, bookingId: refund.bookingId, amount: refund.amount, method: "Admin demo approval", kind: "refund", status: "succeeded", createdAt: new Date().toISOString(), description: refund.reason });
        audit(data, who.id, "Refund approved", id, `৳${refund.amount}`, Date.now());
      });
    },
  },
  admin: demoAdmin,
};
