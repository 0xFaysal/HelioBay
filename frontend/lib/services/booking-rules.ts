import type { Booking, Station, Vehicle } from "@/types";
export const money = (value: number) => `৳${Math.round(value).toLocaleString("en-US")}`;
export const dateTime = (iso: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(iso));
export function priceAt(station: Station, start?: string) {
  const hour = start ? new Date(Date.parse(start) + 6 * 3600000).getUTCHours() : 0;
  return station.price * (hour >= 17 && hour < 21 ? station.pricing?.peakMultiplier ?? 1 : 1);
}
export function estimateCost(station: Station, duration: number, promo = "", vehicle?: Vehicle, start?: string) {
  const energy = Math.min(station.power * .5 * duration / 60, vehicle ? vehicle.capacity * (100 - vehicle.battery) / 100 : 60);
  const subtotal = Math.round(energy * priceAt(station, start));
  const fee = station.pricing?.bookingFee ?? 20;
  const discount = promo.toUpperCase() === "HELIO10" ? Math.round(subtotal * (station.pricing?.promoPercent ?? 10) / 100) : 0;
  const estimate = subtotal + fee - discount;
  return { energy, subtotal, fee, discount, estimate, advance: Math.ceil(estimate * .3) };
}
export function overlaps(start: string, duration: number, other: Booking) {
  return ["upcoming", "charging"].includes(other.status) && Date.parse(start) < Date.parse(other.start) + other.duration * 60000 && Date.parse(start) + duration * 60000 > Date.parse(other.start);
}
export function findBay(station: Station, bookings: Booking[], start: string, duration: number) {
  const bays = station.enabledBayIds ?? Array.from({ length: station.available }, (_, i) => `BAY${String(i + 1).padStart(2, "0")}`);
  for (const bay of bays) if (!bookings.some(b => b.stationId === station.id && b.bayId === bay && overlaps(start, duration, b))) return bay;
  return null;
}
export function validateBooking(station: Station, vehicle: Vehicle | undefined, start: string, duration: number, bookings: Booking[], now = Date.now()) {
  const time = Date.parse(start);
  if (!station.online || station.maintenance) throw new Error("This station is offline. Please choose another station.");
  if (!vehicle) throw new Error("Select a vehicle to continue.");
  if (vehicle.battery >= 100) throw new Error("Your vehicle is fully charged. Select another vehicle or update its demo battery level.");
  if (vehicle.connector !== station.connector) throw new Error("This connector is not compatible with your vehicle.");
  if (!Number.isFinite(time) || time <= now) throw new Error("Choose a future date and time.");
  if (time > now + 30 * 86400000) throw new Error("Reservations open up to 30 days ahead.");
  if (![30, 60, 90, 120].includes(duration)) throw new Error("Choose a valid charging duration.");
  if (station.openingHours) {
    const [open, close] = station.openingHours.split("–").map(t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; });
    const local = new Date(time + 6 * 3600000);
    const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
    if (minute < open || minute + duration > close) throw new Error(`Choose a slot within opening hours (${station.openingHours}, Dhaka time).`);
  }
  if (bookings.some(b => b.vehicleId === vehicle.id && overlaps(start, duration, b))) throw new Error("Your vehicle already has a booking at this time.");
  const bayId = findBay(station, bookings, start, duration);
  if (!bayId) throw new Error("This slot is no longer available. Please choose another time.");
  return bayId;
}
export function refundableAmount(booking: Booking, now = Date.now()) {
  return booking.status === "upcoming" && Date.parse(booking.start) - now >= 3600000 ? Math.max(0, booking.advance - booking.fee - (booking.cancellationFee ?? 0)) : 0;
}
