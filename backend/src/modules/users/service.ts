import type { Database } from '../../shared/database/client.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { z } from 'zod';
import type { profilePatch, vehicleInput, vehiclePatch } from './validation.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { activeSessionStatuses } from '../sessions/service.js';
import { pageArgs } from '../../shared/validation/common.js';
export class UserService {
  constructor(private db: Database) {}
  get(id: string) { return this.db.user.findUniqueOrThrow({ where: { id } }); }
  patch(id: string, data: z.infer<typeof profilePatch>) { return this.db.user.update({ where: { id }, data }); }
  vehicles(ownerId: string, p: { page: number; limit: number }) { return this.db.vehicle.findMany({ where: { ownerId }, ...pageArgs(p), orderBy: { id: 'asc' } }); }
  createVehicle(ownerId: string, data: z.infer<typeof vehicleInput>) {
    return this.db.$transaction(async tx => {
      if (data.isDefault) await tx.vehicle.updateMany({ where: { ownerId }, data: { isDefault: false } });
      return tx.vehicle.create({ data: { ...data, ownerId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  mutateVehicle(ownerId: string, id: string, data?: z.infer<typeof vehiclePatch>) {
    return this.db.$transaction(async tx => {
      await tx.vehicle.findFirstOrThrow({ where: { id, ownerId } });
      if (await tx.chargingSession.count({ where: { vehicleId: id, completedAt: null, status: { in: [...activeSessionStatuses] } } })) throw new ApiError(409, 'ACTIVE_SESSION', 'Vehicle has an active charging session');
      if (!data) return tx.vehicle.delete({ where: { id, ownerId } });
      if (data.isDefault) await tx.vehicle.updateMany({ where: { ownerId }, data: { isDefault: false } });
      return tx.vehicle.update({ where: { id, ownerId }, data });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
