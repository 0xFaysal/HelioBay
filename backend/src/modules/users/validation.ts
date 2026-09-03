import { z } from 'zod';
export const profilePatch = z.object({ name: z.string().trim().min(1).max(100).optional(), phone: z.string().trim().max(30).nullable().optional(), city: z.string().trim().max(100).nullable().optional() }).strict().refine(v => Object.keys(v).length > 0, 'At least one field is required');
export const vehicleInput = z.object({ name: z.string().trim().min(1).max(100), plate: z.string().trim().min(1).max(30), connectorType: z.enum(['CCS2','TYPE_2','CHADEMO','AC_SOCKET']), capacityWh: z.number().int().positive().max(1000000), isDefault: z.boolean().default(false) }).strict();
export const vehiclePatch = vehicleInput.partial().extend({ isDefault: z.boolean().optional() }).refine(v => Object.keys(v).length > 0, 'At least one field is required');

