import type { StationRepository } from './repository.js';
type StationRecord = Awaited<ReturnType<StationRepository['get']>>;
export function publicStation<T extends StationRecord>(station: T) {
  const { bays, _count, ...rest } = station;
  return { ...rest, latitude: Number(station.latitude), longitude: Number(station.longitude), totalBays: _count.bays, availableBays: bays.length };
}
export class StationService {
  constructor(private repo: StationRepository) {}
  async list(p: { page: number; limit: number }) { return (await this.repo.list(p)).map(publicStation); }
  async get(id: string) { return publicStation(await this.repo.get(id)); }
  async bays(id: string, p: { page: number; limit: number }) { await this.repo.get(id); return this.repo.bays(id, p); }
  async nearest(q: { lat: number; lng: number; radiusKm: number; limit: number }) { return (await this.repo.nearest(q.lat, q.lng, q.radiusKm, q.limit)).map(publicStation); }
}
