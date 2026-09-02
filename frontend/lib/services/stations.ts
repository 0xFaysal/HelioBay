"use client";
import { platform } from "@/lib/platform";
import type { Station, Booking } from "@/types";
export const stationService = platform.stations;
export function liveStation(station: Station, bookings: Booking[], now: number): Station {
  const occupied = new Set(bookings.filter(b => b.stationId === station.id && (b.status === "charging" || b.status === "upcoming" && Date.parse(b.start) <= now && Date.parse(b.start) + b.duration * 60000 > now)).map(b => b.bayId));
  return { ...station, available: station.online ? Math.max(0, station.available - occupied.size) : 0 };
}
export function distanceKm(
  a: {
    lat: number;
    lng: number;
  },
  b: {
    lat: number;
    lng: number;
  }
) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
