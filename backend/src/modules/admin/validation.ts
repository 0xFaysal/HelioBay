import { z } from 'zod';
import { id } from '../../shared/validation/common.js';
const name = z.string().trim().min(1).max(100);
export const reasonSchema = z.string().trim().min(5).max(500);
export const stationInput = z.object({ code: name, name, address: z.string().trim().min(1).max(500), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), status: z.enum(['ONLINE','OFFLINE','MAINTENANCE']).default('OFFLINE'), isOpen: z.boolean().default(false), openingHours: z.string().max(200).nullable().optional(), solarCapable: z.boolean().default(false), batteryCapable: z.boolean().default(false), tariffId: id }).strict();
export const stationPatch = stationInput.partial().extend({ status: stationInput.shape.status.removeDefault().optional(), isOpen: z.boolean().optional(), solarCapable: z.boolean().optional(), batteryCapable: z.boolean().optional(), primaryDeviceId: id.nullable().optional() }).strict();
export const bayInput = z.object({ code: name, stationId: id, deviceId: id, number: z.number().int().min(1).max(1000), connectorType: z.enum(['CCS2','TYPE_2','CHADEMO','AC_SOCKET']), relayChannel: z.number().int().min(1).max(32), status: z.enum(['AVAILABLE','PLUGGED','STARTING','CHARGING','STOPPING','FAULT','OFFLINE','DISABLED']).default('OFFLINE'), enabled: z.boolean().default(true), maxPowerW: z.number().int().positive().max(1000000) }).strict();
export const deviceInput = z.object({ publicId: name, stationId: id, mqttClientId: name, firmwareVersion: z.string().max(100).nullable().optional(), credentialRef: z.string().regex(/^secret:\/\/[a-zA-Z0-9/_-]+$/).max(200).nullable().optional(), hardwareMetadata: z.object({ model: name.optional(), channels: z.number().int().min(1).max(32).optional() }).strict().optional() }).strict();
export const tariffInput = z.object({ name, priceMinorPerKwh: z.number().int().positive().max(1000000), active: z.boolean().default(true) }).strict();
export const userStatusInput = z.object({ status: z.enum(['ACTIVE','BLOCKED','DISABLED']), reason: reasonSchema }).strict();
export const mutationBody = z.object({ data: z.unknown(), reason: reasonSchema.optional() }).strict();

export const bayPatch = bayInput.partial().extend({ status: bayInput.shape.status.removeDefault().optional(), enabled: z.boolean().optional() });
export const tariffPatch = tariffInput.partial().extend({ active: z.boolean().optional() });

