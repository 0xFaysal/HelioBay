import { Prisma } from '../../generated/prisma/client.js';
export const deviceSelect = { id: true, publicId: true, stationId: true, status: true, dataSource: true, simulationSpeed: true, thresholds: true, firmwareVersion: true, mqttClientId: true, lastSeenAt: true, createdAt: true, updatedAt: true } satisfies Prisma.DeviceSelect;

