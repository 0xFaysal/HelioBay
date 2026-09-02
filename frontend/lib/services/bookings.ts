"use client";
import { getOwnerData, useDemoStore } from "@/store/demo-store";
import { stationService } from "./stations";
import { estimateCost, refundableAmount, validateBooking } from "./booking-rules";
import type { Booking, BookingInput, Payment } from "@/types";
export interface BookingService { reserve(input: BookingInput): Promise<Booking>; cancel(id: string): number }
export const bookingService: BookingService = {
  async reserve(input) {
    const accountId = useDemoStore.getState().activeId;
    await new Promise(r => setTimeout(r, 900));
    if (useDemoStore.getState().activeId !== accountId) throw new Error("Your account changed. Please try again.");
    const data = getOwnerData(); const existing = data.bookings.find(b => b.id === input.requestId); if (existing) return existing;
    if (input.method === "Test failure") throw new Error("Test payment declined. No money was taken and no slot was reserved. Choose another method and retry.");
    if (!["bKash", "Nagad", "Card", "Test payment"].includes(input.method)) throw new Error("Choose a payment method.");
    if (input.promo && input.promo.toUpperCase() !== "HELIO10") throw new Error("Promo code not recognized. Try HELIO10.");
    const station = stationService.get(input.stationId); if (!station) throw new Error("Station not found.");
    const vehicle = data.vehicles.find(v => v.id === input.vehicleId);
    const allBookings = Object.values(useDemoStore.getState().owners).flatMap(o => o.bookings);
    const bayId = validateBooking(station, vehicle, input.start, input.duration, allBookings);
    const cost = estimateCost(station, input.duration, input.promo, vehicle); const createdAt = new Date().toISOString(); const paymentId = `TX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const booking: Booking = { id: input.requestId, stationId: input.stationId, vehicleId: input.vehicleId, start: input.start, duration: input.duration, bayId, status: "upcoming", estimate: cost.estimate, advance: cost.advance, fee: cost.fee, discount: cost.discount, paymentId, createdAt };
    const payment: Payment = { id: paymentId, bookingId: booking.id, amount: cost.advance, method: input.method, kind: "payment", status: "succeeded", createdAt, description: "Reservation advance" };
    useDemoStore.getState().update(d => ({ ...d, bookings: [booking, ...d.bookings], payments: [payment, ...d.payments], notificationsRead: false }));
    return booking;
  },
  cancel(id) {
    const data = getOwnerData(); const booking = data.bookings.find(b => b.id === id);
    if (!booking || booking.status !== "upcoming") throw new Error("Only upcoming bookings can be cancelled.");
    const refund = refundableAmount(booking); const original = data.payments.find(p => p.id === booking.paymentId);
    useDemoStore.getState().update(d => ({ ...d, bookings: d.bookings.map(b => b.id === id ? { ...b, status: "cancelled" } : b), sessions: d.sessions.map(s => s.bookingId === id ? { ...s, status: "completed", power: 0 } : s), payments: [
      ...(refund ? [{ id: `RF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, bookingId: id, amount: refund, method: original?.method ?? "Test payment", kind: "refund" as const, status: "succeeded" as const, createdAt: new Date().toISOString(), description: "Cancellation refund · simulated" }] : []),
      ...d.payments.map(p => p.id === booking.paymentId && refund ? { ...p, status: "refunded" as const } : p),
    ] })); return refund;
  },
};
