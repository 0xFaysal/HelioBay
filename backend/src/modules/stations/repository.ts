import { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../shared/database/client.js';
import { pageArgs } from '../../shared/validation/common.js';
export const stationSelect = { id: true, code: true, name: true, address: true, latitude: true, longitude: true, status: true, isOpen: true, openingHours: true, solarCapable: true, batteryCapable: true, tariff: { select: { id: true, name: true, priceMinorPerKwh: true, currency: true } }, primaryDevice: { select: { id: true, publicId: true, dataSource: true, status: true, lastSeenAt: true, firmwareVersion: true } }, createdAt: true, updatedAt: true, _count: { select: { bays: true } }, bays: { where: { enabled: true, status: 'AVAILABLE' }, select: { id: true } } } satisfies Prisma.StationSelect;
export const baySelect = { id: true, code: true, stationId: true, deviceId: true, number: true, connectorType: true, relayChannel: true, status: true, enabled: true, maxPowerW: true, plugConnected: true, relayOn: true, lastTelemetryAt: true, device: { select: { dataSource: true } } } satisfies Prisma.BaySelect;
export class StationRepository {
  constructor(private db: Database) {}
  list(p: { page: number; limit: number }) { return this.db.station.findMany({ ...pageArgs(p), orderBy: { code: 'asc' }, select: stationSelect }); }
  get(id: string) { return this.db.station.findUniqueOrThrow({ where: { id }, select: stationSelect }); }
  bays(id: string, p: { page: number; limit: number }) { return this.db.bay.findMany({ where: { stationId: id }, ...pageArgs(p), orderBy: { number: 'asc' }, select: baySelect }); }
  async nearest(lat: number, lng: number, radiusKm: number, limit: number) {
    // Clamped Haversine handles poles, roundoff and the antimeridian. Values are SQL parameters.
    const rows = await this.db.$queryRaw<{ id: string; distanceKm: number }[]>(Prisma.sql`
      WITH distances AS (
        SELECT id, 6371.0088 * 2 * asin(sqrt(LEAST(1.0, GREATEST(0.0,
          power(sin(radians("latitude"::float8 - ${lat}) / 2), 2) +
          cos(radians(${lat}::float8)) * cos(radians("latitude"::float8)) *
          power(sin(radians("longitude"::float8 - ${lng}) / 2), 2)
        )))) AS "distanceKm" FROM "Station"
      ) SELECT * FROM distances WHERE "distanceKm" <= ${radiusKm}
      ORDER BY "distanceKm", id LIMIT ${limit}`);
    const stations = await this.db.station.findMany({ where: { id: { in: rows.map(r => r.id) } }, select: stationSelect });
    return rows.flatMap(row => { const station = stations.find(s => s.id === row.id); return station ? [{ ...station, distanceKm: row.distanceKm }] : []; });
  }
}


