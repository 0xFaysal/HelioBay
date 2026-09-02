import { stations } from "@/lib/demo/seed";
import type { Station } from "@/types";
export interface StationService { list(): Promise<Station[]>; get(id: string): Station | undefined }
export const stationService: StationService = { list: async () => { await new Promise(r => setTimeout(r, 250)); return stations; }, get: (id) => stations.find(s => s.id === id) };
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180; const dLat = (b.lat - a.lat) * rad; const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
