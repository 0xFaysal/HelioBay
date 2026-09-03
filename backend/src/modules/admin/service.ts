import { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../shared/database/client.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { pageArgs } from '../../shared/validation/common.js';
import { activeSessionStatuses } from '../sessions/service.js';
import { checkBayAssignment } from '../bays/service.js';
import { deviceSelect } from '../devices/service.js';
import { writeAudit, type AuditContext } from '../audit/service.js';
import { stationInput, stationPatch, bayInput, bayPatch, deviceInput, tariffInput, tariffPatch, userStatusInput, reasonSchema } from './validation.js';
export type Resource = 'stations' | 'bays' | 'devices' | 'tariffs';
export class AdminService {
  constructor(private db: Database) {}
  users(p: { page: number; limit: number; search?: string }) { return this.db.user.findMany({ where: p.search ? { OR: [{ email: { contains: p.search, mode: 'insensitive' } }, { name: { contains: p.search, mode: 'insensitive' } }] } : {}, ...pageArgs(p), orderBy: { id: 'asc' }, include: { wallet: { select: { balanceMinor: true, currency: true } } } }); }
  user(id: string) { return this.db.user.findUniqueOrThrow({ where: { id } }); }
  changeUser(id: string, input: unknown, ctx: AuditContext) {
    const data = userStatusInput.parse(input);
    if (id === ctx.actorId && data.status !== 'ACTIVE') throw new ApiError(422, 'SELF_DEACTIVATION', 'Administrators cannot deactivate themselves');
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${id} FOR UPDATE`;
      const before = await tx.user.findUniqueOrThrow({ where: { id } });
      // An operator must stop and reconcile physical charging before account deactivation.
      if (data.status !== 'ACTIVE' && await tx.chargingSession.count({ where: { ownerId: id, completedAt: null, status: { in: [...activeSessionStatuses] } } })) throw new ApiError(409, 'ACTIVE_SESSION', 'Stop active charging safely before deactivating this account');
      const after = await tx.user.update({ where: { id }, data: { status: data.status } });
      await writeAudit(tx, { ...ctx, reason: data.reason }, 'USER_STATUS_CHANGED', 'User', id, before, after);
      return after;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  audit(p: { page: number; limit: number }) { return this.db.auditLog.findMany({ ...pageArgs(p), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }); }
  list(resource: Resource, p: { page: number; limit: number }) {
    const args = { ...pageArgs(p), orderBy: { id: 'asc' as const } };
    switch (resource) {
      case 'stations': return this.db.station.findMany(args);
      case 'bays': return this.db.bay.findMany(args);
      case 'devices': return this.db.device.findMany({ ...args, select: deviceSelect });
      case 'tariffs': return this.db.tariff.findMany(args);
    }
  }
  get(resource: Resource, id: string) {
    switch (resource) {
      case 'stations': return this.db.station.findUniqueOrThrow({ where: { id } });
      case 'bays': return this.db.bay.findUniqueOrThrow({ where: { id } });
      case 'devices': return this.db.device.findUniqueOrThrow({ where: { id }, select: deviceSelect });
      case 'tariffs': return this.db.tariff.findUniqueOrThrow({ where: { id } });
    }
  }
  mutate(resource: Resource, action: 'CREATE' | 'UPDATE' | 'DELETE', id: string | undefined, input: unknown, ctx: AuditContext) {
    if (action === 'DELETE') reasonSchema.parse(ctx.reason);
    return this.db.$transaction(async tx => {
      let before: unknown = null;
      let after: { id: string };
      const where = { id: id! };
      if (id && resource !== 'tariffs') {
        const sessionWhere = resource === 'stations' ? { stationId: id } : resource === 'bays' ? { bayId: id } : { deviceId: id };
        if (await tx.chargingSession.count({ where: { ...sessionWhere, completedAt: null, status: { in: [...activeSessionStatuses] } } })) throw new ApiError(409, 'ACTIVE_SESSION', 'Hardware cannot change during active charging');
      }
      switch (resource) {
        case 'stations': {
          if (id) before = await tx.station.findUniqueOrThrow({ where });
          if (action === 'DELETE') { after = await tx.station.delete({ where }); break; }
          if (action === 'CREATE') { after = await tx.station.create({ data: stationInput.parse(input) }); break; }
          const data = stationPatch.parse(input);
          if ('primaryDeviceId' in data) {
            if (data.primaryDeviceId) {
              const device = await tx.device.findUniqueOrThrow({ where: { id: data.primaryDeviceId } });
              if (device.stationId !== id) throw new ApiError(422, 'INVALID_ASSIGNMENT', 'Primary device must belong to this station');
            }
            if (await tx.bay.count({ where: { stationId: id, ...(data.primaryDeviceId ? { deviceId: { not: data.primaryDeviceId } } : {}) } })) throw new ApiError(409, 'BAYS_ASSIGNED', 'Reassign or remove bays before changing the primary device');
          }
          after = await tx.station.update({ where, data }); break;
        }
        case 'bays': {
          const current = id ? await tx.bay.findUniqueOrThrow({ where }) : null; before = current;
          if (action === 'DELETE') { after = await tx.bay.delete({ where }); break; }
          const fields = current ? { code: current.code, stationId: current.stationId, deviceId: current.deviceId, number: current.number, connectorType: current.connectorType, relayChannel: current.relayChannel, status: current.status, enabled: current.enabled, maxPowerW: current.maxPowerW } : {};
          const data = action === 'CREATE' ? bayInput.parse(input) : bayInput.parse({ ...fields, ...bayPatch.parse(input) });
          await checkBayAssignment(tx, data.stationId, data.deviceId);
          after = action === 'CREATE' ? await tx.bay.create({ data }) : await tx.bay.update({ where, data }); break;
        }
        case 'devices': {
          const current = id ? await tx.device.findUniqueOrThrow({ where }) : null; before = current;
          if (action === 'DELETE') { after = await tx.device.delete({ where, select: deviceSelect }); break; }
          const data = action === 'CREATE' ? deviceInput.parse(input) : deviceInput.partial().parse(input);
          if (current && data.stationId && current.stationId !== data.stationId) {
            if (await tx.bay.count({ where: { deviceId: id } }) || await tx.station.count({ where: { primaryDeviceId: id } })) throw new ApiError(409, 'DEVICE_ASSIGNED', 'Unassign primary device and bays before moving this device');
          }
          after = action === 'CREATE' ? await tx.device.create({ data: deviceInput.parse(data), select: deviceSelect }) : await tx.device.update({ where, data, select: deviceSelect }); break;
        }
        case 'tariffs': {
          if (id) before = await tx.tariff.findUniqueOrThrow({ where });
          after = action === 'DELETE' ? await tx.tariff.delete({ where }) : action === 'CREATE' ? await tx.tariff.create({ data: tariffInput.parse(input) }) : await tx.tariff.update({ where, data: tariffPatch.parse(input) }); break;
        }
      }
      await writeAudit(tx, ctx, `${resource.toUpperCase()}_${action}`, resource, after.id, before, action === 'DELETE' ? null : after);
      return action === 'DELETE' ? { deleted: true } : after;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}



