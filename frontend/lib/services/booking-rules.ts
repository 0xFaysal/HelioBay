import type { Booking, Station, Vehicle } from "@/types";
export const money = (value: number) => `৳${Math.round(value).toLocaleString("en-US")}`;
export const dateTime = (iso: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(iso));
export function estimateCost(station: Station, duration: number, promo = "", vehicle?: Vehicle) {
  const energy = Math.min(station.power * 0.5 * duration / 60, vehicle ? vehicle.capacity * (100 - vehicle.battery) / 100 : 60);
  const subtotal = Math.round(energy * station.price); const fee = 20; const discount = promo.toUpperCase() === "HELIO10" ? Math.round(subtotal * .1) : 0;
  const estimate = subtotal + fee - discount; return { energy, subtotal, fee, discount, estimate, advance: Math.ceil(estimate * .3) };
}
export function overlaps(start: string, duration: number, other: Booking) {
  return ["upcoming", "charging"].includes(other.status) && new Date(start).getTime() < new Date(other.start).getTime() + other.duration * 60000 && new Date(start).getTime() + duration * 60000 > new Date(other.start).getTime();
}
export function findBay(station: Station, bookings: Booking[], start: string, duration: number) {
  // BAY04 at Green Point is occupied by an external demo reservation.
  const capacity = station.available;
  for (let i = 1; i <= capacity; i++) {
    const bay = `BAY${String(i).padStart(2, "0")}`;
    if (!bookings.some(b => b.stationId === station.id && b.bayId === bay && overlaps(start, duration, b))) return bay;
  }
  return null;
}
export function validateBooking(station: Station, vehicle: Vehicle | undefined, start: string, duration: number, bookings: Booking[], now = Date.now()) {
  const time = new Date(start).getTime();
  if (!station.online) throw new Error("This station is offline. Please choose another station.");
  if (!vehicle) throw new Error("Select a vehicle to continue.");
  if (vehicle.battery >= 100) throw new Error("Your vehicle is fully charged. Select another vehicle or update its demo battery level.");
  if (vehicle.connector !== station.connector) throw new Error("This connector is not compatible with your vehicle.");
  if (!Number.isFinite(time) || time <= now) throw new Error("Choose a future date and time.");
  if (time > now + 30 * 86400000) throw new Error("Reservations open up to 30 days ahead.");
  if (![30, 60, 90, 120].includes(duration)) throw new Error("Choose a valid charging duration.");
  if (bookings.some(b => b.vehicleId === vehicle.id && overlaps(start, duration, b))) throw new Error("Your vehicle already has a booking at this time.");
  const bayId = findBay(station, bookings, start, duration);
  if (!bayId) throw new Error("This slot is no longer available. Please choose another time.");
  return bayId;
}
export function refundableAmount(booking: Booking, now = Date.now()) {
  return booking.status === "upcoming" && new Date(booking.start).getTime() - now >= 3600000 ? Math.max(0, booking.advance - booking.fee) : 0;
}
