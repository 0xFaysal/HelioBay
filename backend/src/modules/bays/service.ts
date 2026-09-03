import type { Prisma } from '../../generated/prisma/client.js';
import { ApiError } from '../../shared/errors/api-error.js';
export async function checkBayAssignment(tx: Prisma.TransactionClient, stationId: string, deviceId: string) {
  const station = await tx.station.findUniqueOrThrow({ where: { id: stationId } });
  const device = await tx.device.findUniqueOrThrow({ where: { id: deviceId } });
  if (device.stationId !== stationId || station.primaryDeviceId !== deviceId) throw new ApiError(422, 'INVALID_ASSIGNMENT', 'Bay must use its station primary device');
}
